import OpenAI from "openai";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "ファイルが見つかりません" }, { status: 400 });
    }

    const maxSize = 25 * 1024 * 1024; // 25MB (Whisper API limit)
    if (file.size > maxSize) {
      return Response.json(
        { error: "ファイルサイズが25MBを超えています" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "ja",
      response_format: "verbose_json",
    });

    return Response.json({
      text: transcription.text,
      duration: transcription.duration,
      segments: transcription.segments,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    const message =
      error instanceof Error ? error.message : "文字起こしに失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
