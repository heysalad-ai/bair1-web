import { requireAuth } from "@/lib/auth";
import { readJsonObject } from "@/lib/request-limits";
import { usageGate } from "@/lib/usage-budget";
import { generateBearSpeech, MAX_SPEECH_CHARACTERS } from "@/lib/openai-speech";

export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  let text: string;
  try {
    const body = await readJsonObject(request, 8192);
    if (
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.length > MAX_SPEECH_CHARACTERS
    )
      throw new RangeError();
    text = body.text.trim();
  } catch {
    return Response.json(
      { error: "Choose a summary of up to 1,200 characters." },
      { status: 400 },
    );
  }
  if (!process.env.OPENAI_API_KEY)
    return Response.json(
      { error: "Voice is not configured. You can still read the summary." },
      { status: 503 },
    );
  const limited = await usageGate("voice", auth.user.userId);
  if (limited) return limited;
  try {
    const speech = await generateBearSpeech(text, {
      subject: auth.user.userId,
      signal: request.signal,
    });
    return Response.json(
      {
        audio: `data:audio/wav;base64,${speech.audio.toString("base64")}`,
        text: speech.transcript,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Voice is unavailable right now. Please try again; the summary is still available below.",
      },
      { status: 503, headers: { "Retry-After": "10" } },
    );
  }
}
