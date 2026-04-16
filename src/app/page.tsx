"use client";

import { useState, useRef, useCallback } from "react";

type Minutes = {
  title: string;
  summary: string;
  participants: string[];
  agendaItems: {
    topic: string;
    discussion: string;
    decisions: string[];
    actionItems: string[];
  }[];
  nextSteps: string[];
  notes: string;
};

type Status = "idle" | "transcribing" | "generating" | "done" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [transcription, setTranscription] = useState("");
  const [minutes, setMinutes] = useState<Minutes | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"minutes" | "transcription">("minutes");
  const [hasDiarization, setHasDiarization] = useState(false);
  const [speakerCount, setSpeakerCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(mp3|wav|m4a|webm|ogg|flac|mp4)$/i)) {
      setError("対応形式: MP3, WAV, M4A, WebM, OGG, FLAC, MP4");
      setStatus("error");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError("ファイルサイズは25MB以下にしてください");
      setStatus("error");
      return;
    }

    setFileName(file.name);
    setError("");
    setTranscription("");
    setMinutes(null);
    setHasDiarization(false);
    setSpeakerCount(0);
    setStatus("transcribing");

    try {
      // Step 1: Transcribe
      const formData = new FormData();
      formData.append("file", file);

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) {
        const errData = await transcribeRes.json();
        throw new Error(errData.error || "文字起こしに失敗しました");
      }

      const transcribeData = await transcribeRes.json();
      setTranscription(transcribeData.text);
      setHasDiarization(transcribeData.hasDiarization || false);
      setSpeakerCount(transcribeData.speakerCount || 0);

      // Step 2: Generate minutes
      setStatus("generating");

      const minutesRes = await fetch("/api/minutes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcribeData.text }),
      });

      if (!minutesRes.ok) {
        const errData = await minutesRes.json();
        throw new Error(errData.error || "議事録の生成に失敗しました");
      }

      const minutesData = await minutesRes.json();
      setMinutes(minutesData);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setStatus("error");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const formatMinutesMarkdown = useCallback(() => {
    if (!minutes) return "";
    let md = `# ${minutes.title}\n\n`;
    if (minutes.summary) md += `## 概要\n${minutes.summary}\n\n`;
    if (minutes.participants.length > 0) {
      md += `## 参加者\n${minutes.participants.map((p) => `- ${p}`).join("\n")}\n\n`;
    }
    if (minutes.agendaItems.length > 0) {
      md += `## 議題\n\n`;
      minutes.agendaItems.forEach((item, i) => {
        md += `### ${i + 1}. ${item.topic}\n\n`;
        if (item.discussion) md += `${item.discussion}\n\n`;
        if (item.decisions.length > 0) {
          md += `**決定事項:**\n${item.decisions.map((d) => `- ${d}`).join("\n")}\n\n`;
        }
        if (item.actionItems.length > 0) {
          md += `**アクションアイテム:**\n${item.actionItems.map((a) => `- ${a}`).join("\n")}\n\n`;
        }
      });
    }
    if (minutes.nextSteps.length > 0) {
      md += `## 次のステップ\n${minutes.nextSteps.map((s) => `- ${s}`).join("\n")}\n\n`;
    }
    if (minutes.notes) md += `## 補足\n${minutes.notes}\n`;
    return md;
  }, [minutes]);

  const copyToClipboard = useCallback(async () => {
    const text = formatMinutesMarkdown();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [formatMinutesMarkdown]);

  const downloadMarkdown = useCallback(() => {
    const text = formatMinutesMarkdown();
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `議事録_${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [formatMinutesMarkdown]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError("");
    setTranscription("");
    setMinutes(null);
    setFileName("");
    setActiveTab("minutes");
    setHasDiarization(false);
    setSpeakerCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <main className="min-h-dvh">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            議事録メーカー
          </h1>
          {status === "done" && (
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              新しいファイル
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Upload Area */}
        {(status === "idle" || status === "error") && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all
              ${dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
              }
            `}
          >
            <div className="text-5xl mb-4">
              {dragOver ? "+" : ""}
            </div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              音声ファイルをドラッグ&ドロップ
            </p>
            <p className="text-sm text-gray-500 mb-4">
              または クリックしてファイルを選択
            </p>
            <p className="text-xs text-gray-400">
              MP3, WAV, M4A, WebM, OGG, FLAC, MP4 (25MB以下)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/mp4,video/webm,.mp3,.wav,.m4a,.webm,.ogg,.flac,.mp4"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        )}

        {/* Error */}
        {status === "error" && error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Processing */}
        {(status === "transcribing" || status === "generating") && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-block mb-6">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              {status === "transcribing" ? "文字起こし中..." : "議事録を生成中..."}
            </p>
            <p className="text-sm text-gray-500">
              {fileName}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <StepIndicator label="文字起こし" active={status === "transcribing"} done={status === "generating"} />
              <StepIndicator label="議事録生成" active={status === "generating"} done={false} />
            </div>
          </div>
        )}

        {/* Results */}
        {status === "done" && minutes && (
          <div className="space-y-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab("minutes")}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                  activeTab === "minutes"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                議事録
              </button>
              <button
                onClick={() => setActiveTab("transcription")}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                  activeTab === "transcription"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                文字起こし
              </button>
            </div>

            {/* Minutes Tab */}
            {activeTab === "minutes" && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
                {/* Title & Summary */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">
                    {minutes.title}
                  </h2>
                  {minutes.summary && (
                    <p className="text-gray-600">{minutes.summary}</p>
                  )}
                </div>

                {/* Participants */}
                {minutes.participants.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      参加者
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {minutes.participants.map((p, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agenda Items */}
                {minutes.agendaItems.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      議題
                    </h3>
                    {minutes.agendaItems.map((item, i) => (
                      <div
                        key={i}
                        className="border border-gray-100 rounded-xl p-4 space-y-3"
                      >
                        <h4 className="font-semibold text-gray-900">
                          {i + 1}. {item.topic}
                        </h4>
                        {item.discussion && (
                          <p className="text-sm text-gray-600">{item.discussion}</p>
                        )}
                        {item.decisions.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-700 mb-1">
                              決定事項
                            </p>
                            <ul className="space-y-1">
                              {item.decisions.map((d, j) => (
                                <li
                                  key={j}
                                  className="text-sm text-gray-700 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-2 before:h-2 before:bg-green-400 before:rounded-full"
                                >
                                  {d}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.actionItems.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-blue-700 mb-1">
                              アクションアイテム
                            </p>
                            <ul className="space-y-1">
                              {item.actionItems.map((a, j) => (
                                <li
                                  key={j}
                                  className="text-sm text-gray-700 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-2 before:h-2 before:bg-blue-400 before:rounded-full"
                                >
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Next Steps */}
                {minutes.nextSteps.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      次のステップ
                    </h3>
                    <ul className="space-y-1">
                      {minutes.nextSteps.map((s, i) => (
                        <li
                          key={i}
                          className="text-sm text-gray-700 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-2 before:w-2 before:h-2 before:bg-purple-400 before:rounded-full"
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Notes */}
                {minutes.notes && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      補足
                    </h3>
                    <p className="text-sm text-gray-600">{minutes.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={copyToClipboard}
                    className="flex-1 py-2.5 px-4 text-sm font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    {copied ? "コピーしました" : "コピー"}
                  </button>
                  <button
                    onClick={downloadMarkdown}
                    className="flex-1 py-2.5 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Markdownダウンロード
                  </button>
                </div>
              </div>
            )}

            {/* Transcription Tab */}
            {activeTab === "transcription" && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">文字起こし結果</h3>
                    {hasDiarization && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                        話者分離 ({speakerCount}人)
                      </span>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(transcription);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    {copied ? "コピーしました" : "コピー"}
                  </button>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 max-h-96 overflow-y-auto space-y-1">
                  {hasDiarization ? (
                    transcription.split("\n").map((line, i) => {
                      const match = line.match(/^(話者\d+): (.+)$/);
                      if (!match) return <p key={i} className="text-sm text-gray-700">{line}</p>;
                      const speaker = match[1];
                      const text = match[2];
                      const tagNum = parseInt(speaker.replace("話者", ""), 10);
                      const colors = [
                        "bg-blue-100 text-blue-700",
                        "bg-orange-100 text-orange-700",
                        "bg-green-100 text-green-700",
                        "bg-purple-100 text-purple-700",
                        "bg-pink-100 text-pink-700",
                        "bg-teal-100 text-teal-700",
                      ];
                      const colorClass = colors[(tagNum - 1) % colors.length];
                      return (
                        <div key={i} className="flex gap-2 items-start">
                          <span className={`shrink-0 px-2 py-0.5 text-xs font-bold rounded-full ${colorClass}`}>
                            {speaker}
                          </span>
                          <span className="text-sm text-gray-700">{text}</span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {transcription}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function StepIndicator({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-3 rounded-full transition-colors ${
          done
            ? "bg-green-500"
            : active
            ? "bg-blue-500 animate-pulse"
            : "bg-gray-300"
        }`}
      />
      <span
        className={`text-sm ${
          done
            ? "text-green-700 font-medium"
            : active
            ? "text-blue-700 font-medium"
            : "text-gray-400"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
