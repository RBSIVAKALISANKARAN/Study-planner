import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// ── helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function extractTextFromStorage(
  storagePath: string,
  adminClient: ReturnType<typeof serviceClient>
): Promise<{ text?: string; imageBase64?: string; mimeType?: string }> {
  const { data, error } = await adminClient.storage
    .from("syllabi")
    .download(storagePath);
  if (error || !data) throw new Error(`Storage fetch failed: ${error?.message}`);

  const ext = storagePath.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    // Extract text from PDF using raw byte reading (basic — pull visible text)
    const bytes = new Uint8Array(await data.arrayBuffer());
    // Decode as latin-1 and pull text between BT/ET blocks (simple heuristic)
    const raw = new TextDecoder("latin-1").decode(bytes);
    const chunks: string[] = [];
    const re = /\(([^)]{1,300})\)\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
      chunks.push(m[1]);
    }
    const text = chunks.join(" ").replace(/\s+/g, " ").trim();
    return { text: text.length > 50 ? text : raw.slice(0, 8000) };
  }

  if (ext && ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    const bytes = await data.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
      : ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : "image/gif";
    return { imageBase64: b64, mimeType: mime };
  }

  // Plain text / markdown / docx fallback — treat as UTF-8
  const text = await data.text();
  return { text };
}

interface ParsedTopic {
  name: string;
  description: string;
  difficulty: number;
  estimated_hours: number;
  position: number;
  dependencies: string[];
}

function validateTopics(raw: unknown): ParsedTopic[] {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { topics?: unknown }).topics)) {
    throw new Error("Response missing 'topics' array");
  }
  const topics = (raw as { topics: unknown[] }).topics;
  if (topics.length < 1) throw new Error("Response contains no topics");

  return topics.map((t, i) => {
    if (typeof t !== "object" || t === null) throw new Error(`Topic ${i} is not an object`);
    const topic = t as Record<string, unknown>;
    if (typeof topic.name !== "string" || !topic.name.trim()) {
      throw new Error(`Topic ${i} missing required field 'name'`);
    }
    return {
      name: String(topic.name).trim(),
      description: typeof topic.description === "string" ? topic.description.trim() : "",
      difficulty: typeof topic.difficulty === "number" ? Math.min(5, Math.max(1, Math.round(topic.difficulty))) : 3,
      estimated_hours: typeof topic.estimated_hours === "number" ? Math.max(0, topic.estimated_hours) : 1,
      position: typeof topic.position === "number" ? topic.position : i,
      dependencies: Array.isArray(topic.dependencies)
        ? (topic.dependencies as unknown[]).filter((d): d is string => typeof d === "string")
        : [],
    };
  });
}

async function callGemini(
  text: string | undefined,
  imageBase64: string | undefined,
  mimeType: string | undefined
): Promise<ParsedTopic[]> {
  const systemPrompt =
    "You are a curriculum parser. Extract all topics from the provided syllabus content. " +
    "Respond with ONLY valid JSON matching this exact schema — no markdown, no explanation:\n" +
    '{ "topics": [{ "name": string, "description": string, "difficulty": 1-5, "estimated_hours": number, "position": number, "dependencies": [topic_name] }] }';

  // Build parts array
  const parts: unknown[] = [{ text: systemPrompt }];
  if (imageBase64 && mimeType) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
    parts.push({ text: "Parse the syllabus shown in this image." });
  } else {
    parts.push({ text: `Syllabus content:\n\n${(text ?? "").slice(0, 30000)}` });
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 300)}`);
  }

  const geminiData = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  // Strip markdown code fences if present
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  return validateTopics(parsed);
}

// ── main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Auth validation
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json() as {
      text?: string;
      storage_path?: string;
      confirmed?: boolean;
      topics?: ParsedTopic[];
      upload_id?: string;
    };

    const admin = serviceClient();

    // ── Confirmation pass: insert into DB ────────────────────────────
    if (body.confirmed === true) {
      const { topics, upload_id } = body;
      if (!Array.isArray(topics) || topics.length === 0) {
        return jsonResponse({ error: "topics array required for confirmation" }, 400);
      }

      // topics must belong to a subject; require subject_id in each topic or a top-level one
      // We insert directly into topics (user must have provided subject_id via the UI)
      const topicsToInsert = (topics as (ParsedTopic & { subject_id?: string })[]).map((t, i) => ({
        user_id: user.id,
        subject_id: t.subject_id ?? null,
        name: t.name,
        description: t.description ?? null,
        difficulty: t.difficulty ?? 3,
        estimated_hours: t.estimated_hours ?? null,
        position: t.position ?? i,
      }));

      // Check all topics have subject_id
      if (topicsToInsert.some((t) => !t.subject_id)) {
        return jsonResponse({ error: "Each topic must include a subject_id" }, 400);
      }

      const { data: insertedTopics, error: topicInsertError } = await admin
        .from("topics")
        .insert(topicsToInsert)
        .select("id, name");
      if (topicInsertError) throw new Error(`topics insert: ${topicInsertError.message}`);

      // Build name→id map for relationship resolution
      const nameToId = new Map<string, string>();
      for (const row of insertedTopics ?? []) nameToId.set(row.name, row.id);

      // Insert prerequisite relationships
      const relationships: { parent_topic_id: string; child_topic_id: string; relationship_type: string }[] = [];
      for (const t of (topics as (ParsedTopic & { subject_id?: string })[]) ) {
        const childId = nameToId.get(t.name);
        if (!childId) continue;
        for (const dep of t.dependencies ?? []) {
          const parentId = nameToId.get(dep);
          if (parentId && parentId !== childId) {
            relationships.push({ parent_topic_id: parentId, child_topic_id: childId, relationship_type: "prerequisite" });
          }
        }
      }
      if (relationships.length > 0) {
        const { error: relError } = await admin.from("topic_relationships").insert(relationships);
        if (relError) throw new Error(`relationships insert: ${relError.message}`);
      }

      // Update syllabus_uploads status
      if (upload_id) {
        await admin
          .from("syllabus_uploads")
          .update({ status: "completed", parsed_topics: topics })
          .eq("id", upload_id)
          .eq("user_id", user.id);
      }

      return jsonResponse({ inserted: insertedTopics?.length ?? 0 });
    }

    // ── Parse pass ────────────────────────────────────────────────────

    // Require either text or storage_path
    if (!body.text && !body.storage_path) {
      return jsonResponse({ error: "Provide 'text' or 'storage_path'" }, 400);
    }

    // Cache check: if storage_path already has a completed upload, return cached result
    if (body.storage_path) {
      const { data: cached } = await admin
        .from("syllabus_uploads")
        .select("id, parsed_topics")
        .eq("user_id", user.id)
        .eq("storage_path", body.storage_path)
        .eq("status", "completed")
        .maybeSingle();
      if (cached?.parsed_topics) {
        return jsonResponse({ topics: cached.parsed_topics, upload_id: cached.id, cached: true });
      }
    }

    // Create or update syllabus_uploads row as 'processing'
    let uploadId: string | null = null;
    if (body.storage_path) {
      const { data: upserted } = await admin
        .from("syllabus_uploads")
        .upsert(
          { user_id: user.id, storage_path: body.storage_path, status: "processing" },
          { onConflict: "user_id,storage_path", ignoreDuplicates: false }
        )
        .select("id")
        .maybeSingle();
      uploadId = upserted?.id ?? null;
    }

    // Extract content
    let extractedText: string | undefined;
    let imageBase64: string | undefined;
    let mimeType: string | undefined;

    if (body.storage_path) {
      const extracted = await extractTextFromStorage(body.storage_path, admin);
      extractedText = extracted.text;
      imageBase64 = extracted.imageBase64;
      mimeType = extracted.mimeType;
    } else {
      extractedText = body.text;
    }

    // Call Gemini — validate strictly before returning
    let topics: ParsedTopic[];
    try {
      topics = await callGemini(extractedText, imageBase64, mimeType);
    } catch (err) {
      if (uploadId) {
        await admin.from("syllabus_uploads").update({ status: "failed" }).eq("id", uploadId);
      }
      return jsonResponse({ error: String(err) }, 400);
    }

    // Persist parsed_topics into upload row (still pending user confirmation)
    if (uploadId) {
      await admin
        .from("syllabus_uploads")
        .update({ parsed_topics: topics, status: "pending" })
        .eq("id", uploadId);
    }

    return jsonResponse({ topics, upload_id: uploadId });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
