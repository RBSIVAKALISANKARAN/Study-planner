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

interface FeynmanFeedback {
  gaps: string[];
  jargon: string[];
  strengths: string[];
  suggestions: string[];
}

function validateFeedback(raw: unknown): FeynmanFeedback {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Response is not an object");
  }
  const obj = raw as Record<string, unknown>;
  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? (v as unknown[]).filter((x): x is string => typeof x === "string")
      : [];

  return {
    gaps: toStringArray(obj.gaps),
    jargon: toStringArray(obj.jargon),
    strengths: toStringArray(obj.strengths),
    suggestions: toStringArray(obj.suggestions),
  };
}

async function callGemini(
  topicName: string,
  topicDescription: string,
  explanation: string
): Promise<FeynmanFeedback> {
  // Kept under 300 tokens (system + user) to control cost
  const prompt =
    `You are a Feynman technique coach. Topic: "${topicName}".` +
    (topicDescription ? ` Context: ${topicDescription.slice(0, 120)}.` : "") +
    ` Student explanation: "${explanation.slice(0, 800)}"` +
    " Reply ONLY with valid JSON — no markdown:\n" +
    '{ "gaps": [missing concept strings], "jargon": [unexplained jargon strings], "strengths": [what was explained well], "suggestions": [how to improve] }';

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
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

  return validateFeedback(parsed);
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

    const body = await req.json() as { topic_id?: string; explanation?: string };
    if (!body.topic_id) return jsonResponse({ error: "topic_id is required" }, 400);
    if (!body.explanation?.trim()) return jsonResponse({ error: "explanation is required" }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch topic, verify ownership
    const { data: topic, error: topicError } = await admin
      .from("topics")
      .select("id, name, description, user_id")
      .eq("id", body.topic_id)
      .single();

    if (topicError || !topic) return jsonResponse({ error: "Topic not found" }, 404);
    if (topic.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403);

    let feedback: FeynmanFeedback;
    try {
      feedback = await callGemini(topic.name, topic.description ?? "", body.explanation);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 400);
    }

    return jsonResponse({ feedback });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
