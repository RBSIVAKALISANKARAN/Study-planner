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

const VALID_TYPES = ["compare", "apply", "evaluate", "analyze", "create"] as const;
type QuestionType = typeof VALID_TYPES[number];

interface GeneratedQuestion {
  type: QuestionType;
  question_text: string;
  model_answer: string;
  difficulty: number;
}

function validateQuestions(raw: unknown): GeneratedQuestion[] {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { questions?: unknown }).questions)
  ) {
    throw new Error("Response missing 'questions' array");
  }
  const questions = (raw as { questions: unknown[] }).questions;
  if (questions.length < 1) throw new Error("Response contains no questions");

  return questions.map((q, i) => {
    if (typeof q !== "object" || q === null) throw new Error(`Question ${i} is not an object`);
    const item = q as Record<string, unknown>;

    if (typeof item.question_text !== "string" || !item.question_text.trim()) {
      throw new Error(`Question ${i} missing required field 'question_text'`);
    }
    if (typeof item.model_answer !== "string" || !item.model_answer.trim()) {
      throw new Error(`Question ${i} missing required field 'model_answer'`);
    }

    const type = VALID_TYPES.includes(item.type as QuestionType)
      ? (item.type as QuestionType)
      : "analyze";

    return {
      type,
      question_text: String(item.question_text).trim(),
      model_answer: String(item.model_answer).trim(),
      difficulty:
        typeof item.difficulty === "number"
          ? Math.min(5, Math.max(1, Math.round(item.difficulty)))
          : 3,
    };
  });
}

async function callGemini(
  topicName: string,
  topicDescription: string
): Promise<GeneratedQuestion[]> {
  const prompt =
    `Topic: "${topicName}"\n` +
    (topicDescription ? `Description: ${topicDescription}\n\n` : "\n") +
    "Generate exactly 3 higher-order thinking questions for this topic. " +
    "Use Bloom's taxonomy levels: compare, apply, evaluate, analyze, or create. " +
    "Respond with ONLY valid JSON — no markdown, no explanation:\n" +
    '{ "questions": [{ "type": "compare|apply|evaluate|analyze|create", "question_text": string, "model_answer": string, "difficulty": 1-5 }] }';

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  return validateQuestions(parsed);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json() as { topic_id?: string };
    if (!body.topic_id) return jsonResponse({ error: "topic_id is required" }, 400);

    const admin = serviceClient();

    // Fetch topic, verify ownership
    const { data: topic, error: topicError } = await admin
      .from("topics")
      .select("id, name, description, user_id")
      .eq("id", body.topic_id)
      .single();

    if (topicError || !topic) return jsonResponse({ error: "Topic not found" }, 404);
    if (topic.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);

    // Cache check: return existing questions if 3+ already exist
    const { data: existing, error: existingError } = await admin
      .from("questions")
      .select("id, type, question_text, model_answer, difficulty")
      .eq("topic_id", body.topic_id);

    if (existingError) throw new Error(`questions fetch: ${existingError.message}`);
    if ((existing?.length ?? 0) >= 3) {
      return jsonResponse({ questions: existing, cached: true });
    }

    // Generate via Gemini
    let questions: GeneratedQuestion[];
    try {
      questions = await callGemini(topic.name, topic.description ?? "");
    } catch (err) {
      return jsonResponse({ error: String(err) }, 400);
    }

    // Insert into questions table
    const rows = questions.map((q) => ({
      topic_id: body.topic_id,
      type: q.type,
      question_text: q.question_text,
      model_answer: q.model_answer,
      difficulty: q.difficulty,
    }));

    const { data: inserted, error: insertError } = await admin
      .from("questions")
      .insert(rows)
      .select("id, type, question_text, model_answer, difficulty");

    if (insertError) throw new Error(`questions insert: ${insertError.message}`);

    return jsonResponse({ questions: inserted });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
