import OpenAI from "openai";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return Response.json(
        { error: "テキストが見つかりません" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `あなたは議事録作成の専門家です。文字起こしテキストから構造化された議事録を作成してください。

以下のJSON形式で返してください:
{
  "title": "会議のタイトル（内容から推測）",
  "summary": "会議の概要（2-3文）",
  "participants": ["推測される参加者（わかる場合）"],
  "agendaItems": [
    {
      "topic": "議題",
      "discussion": "議論の内容",
      "decisions": ["決定事項"],
      "actionItems": ["アクションアイテム（担当者がわかれば含める）"]
    }
  ],
  "nextSteps": ["次のステップ"],
  "notes": "その他の補足事項"
}

ルール:
- 発言内容を正確に反映する
- 推測が必要な箇所は「（推測）」と明記
- 参加者が特定できない場合はparticipantsを空配列にする
- 議題が明確でない場合は話題ごとにまとめる
- JSONのみを返す`,
        },
        {
          role: "user",
          content: `以下の文字起こしテキストから議事録を作成してください:\n\n${text}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content || "{}";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] || "{}");

    // Normalize: ensure all expected fields exist with correct types
    const minutes = {
      title: typeof parsed.title === "string" ? parsed.title : "無題の会議",
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      participants: Array.isArray(parsed.participants) ? parsed.participants : [],
      agendaItems: Array.isArray(parsed.agendaItems)
        ? parsed.agendaItems.map((item: Record<string, unknown>) => ({
            topic: typeof item.topic === "string" ? item.topic : "",
            discussion: typeof item.discussion === "string" ? item.discussion : "",
            decisions: Array.isArray(item.decisions) ? item.decisions : [],
            actionItems: Array.isArray(item.actionItems) ? item.actionItems : [],
          }))
        : [],
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps : [],
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };

    return Response.json(minutes);
  } catch (error) {
    console.error("Minutes generation error:", error);
    const message =
      error instanceof Error ? error.message : "議事録の生成に失敗しました";
    return Response.json({ error: message }, { status: 500 });
  }
}
