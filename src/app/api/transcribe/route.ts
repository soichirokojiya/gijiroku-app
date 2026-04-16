import { SpeechClient } from "@google-cloud/speech";
import OpenAI from "openai";

export const maxDuration = 300;

function getGoogleCredentials() {
  const base64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!base64) return null;
  try {
    return JSON.parse(Buffer.from(base64, "base64").toString());
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json(
        { error: "ファイルが見つかりません" },
        { status: 400 }
      );
    }

    if (file.size > 25 * 1024 * 1024) {
      return Response.json(
        { error: "ファイルサイズが25MBを超えています" },
        { status: 400 }
      );
    }

    const credentials = getGoogleCredentials();

    // Try Google Speech-to-Text with diarization
    if (credentials) {
      try {
        return await transcribeWithGoogle(file, credentials);
      } catch (error) {
        console.error("Google Speech error, falling back to Whisper:", error);
      }
    }

    // Fallback to Whisper (no diarization)
    return await transcribeWithWhisper(file);
  } catch (error) {
    console.error("Transcription error:", error);
    const message =
      error instanceof Error ? error.message : "文字起こしに失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function transcribeWithGoogle(
  file: File,
  credentials: Record<string, unknown>
) {
  const client = new SpeechClient({ credentials });
  const audioBytes = Buffer.from(await file.arrayBuffer()).toString("base64");

  const [operation] = await client.longRunningRecognize({
    audio: { content: audioBytes },
    config: {
      languageCode: "ja-JP",
      enableAutomaticPunctuation: true,
      enableWordTimeOffsets: true,
      diarizationConfig: {
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 6,
      },
      model: "latest_long",
      useEnhanced: true,
    },
  });

  const [response] = await operation.promise();
  const results = response.results || [];

  if (results.length === 0) {
    throw new Error("No transcription results from Google");
  }

  // Plain text from all results
  const plainText = results
    .map((r) => r.alternatives?.[0]?.transcript || "")
    .join("");

  // Diarization: the last result contains complete word-level speaker tags
  const lastResult = results[results.length - 1];
  const words = lastResult?.alternatives?.[0]?.words || [];

  if (words.length === 0 || !words.some((w) => (w.speakerTag || 0) > 0)) {
    return Response.json({
      text: plainText,
      plainText,
      hasDiarization: false,
    });
  }

  // Group consecutive words by speaker into segments
  type Segment = { speaker: number; text: string };
  const segments: Segment[] = [];
  let current: Segment | null = null;

  for (const word of words) {
    const tag = word.speakerTag || 0;
    if (!current || current.speaker !== tag) {
      if (current) segments.push(current);
      current = { speaker: tag, text: word.word || "" };
    } else {
      current.text += word.word || "";
    }
  }
  if (current) segments.push(current);

  const diarizedText = segments
    .map((s) => `話者${s.speaker}: ${s.text}`)
    .join("\n");

  const speakerCount = new Set(
    segments.map((s) => s.speaker).filter((s) => s > 0)
  ).size;

  return Response.json({
    text: diarizedText,
    plainText,
    hasDiarization: true,
    speakerCount,
  });
}

async function transcribeWithWhisper(file: File) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ja",
    response_format: "verbose_json",
  });

  return Response.json({
    text: transcription.text,
    plainText: transcription.text,
    hasDiarization: false,
    duration: transcription.duration,
  });
}
