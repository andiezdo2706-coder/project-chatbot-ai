"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Source = { id: string; title: string; excerpt: string };

type Message =
  | { role: "user"; text: string }
  | { role: "bot"; text: string; sources: Source[]; model?: string; latencyMs?: number }
  | { role: "error"; text: string };

const API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL;
const MAX_QUESTION_LENGTH = 500;

const DOCUMENT_NAME = "Quy chế học vụ & Thư viện (bản mẫu)";

const SUGGESTED_QUESTIONS = [
  "Nội dung chính của tài liệu là gì?",
  "Điều kiện để được xét tốt nghiệp là gì?",
  "Mượn sách thư viện tối đa bao nhiêu cuốn và trong bao lâu?",
  "Tài liệu có đề cập đến học bổng du học Nhật Bản không?",
];

async function askBackend(question: string) {
  if (!API_URL) {
    throw new Error(
      "Chưa cấu hình NEXT_PUBLIC_CHAT_API_URL. Hãy đặt biến này (file .env.local hoặc Amplify Environment variables) rồi build lại."
    );
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.error ?? `HTTP ${response.status}`;
    throw new Error(`Không thể xử lý câu hỏi: ${detail}`);
  }
  return data as { answer: string; sources: Source[]; model?: string; latencyMs?: number };
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    try {
      const result = await askBackend(q);
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: result.answer,
          sources: result.sources ?? [],
          model: result.model,
          latencyMs: result.latencyMs,
        },
      ]);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Lỗi không xác định";
      setMessages((prev) => [...prev, { role: "error", text }]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(question);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">SD</span>
          <div>
            <strong>Giới thiệu đồ án của Đỗ Đình Duy</strong>
            <small>Hỏi đáp dựa trên tài liệu</small>
          </div>
        </div>

        <section>
          <h2>Tài liệu</h2>
          <a className="doc" href="/document.md" target="_blank" rel="noreferrer">
            📄 {DOCUMENT_NAME}
          </a>
        </section>

        <section>
          <h2>Câu hỏi gợi ý</h2>
          <ul className="suggestions">
            {SUGGESTED_QUESTIONS.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => send(s)} disabled={loading}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <footer className="stack">
          Amplify → API Gateway → Lambda → Bedrock
          {!API_URL && <span className="warn">⚠ Chưa cấu hình API URL</span>}
        </footer>
      </aside>

      <main className="chat">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty">
              <h1>Hỏi gì về tài liệu cũng được</h1>
              <p>
                Chatbot chỉ trả lời dựa trên nội dung tài liệu và trích dẫn nguồn. Nếu tài liệu không có
                thông tin, chatbot sẽ nói rõ là không tìm thấy.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              <p>{m.text}</p>
              {m.role === "bot" && m.sources.length > 0 && (
                <details className="sources" open>
                  <summary>Nguồn trích dẫn ({m.sources.length})</summary>
                  {m.sources.map((s) => (
                    <blockquote key={s.id}>
                      <strong>
                        [{s.id}] {s.title}
                      </strong>
                      <span>{s.excerpt}</span>
                    </blockquote>
                  ))}
                </details>
              )}
              {m.role === "bot" && m.model && (
                <small className="meta">
                  {m.model}
                  {typeof m.latencyMs === "number" && ` · ${(m.latencyMs / 1000).toFixed(1)}s`}
                </small>
              )}
            </div>
          ))}

          {loading && <div className="bubble bot loading">Đang tìm trong tài liệu…</div>}
          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={onSubmit}>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Nhập câu hỏi về tài liệu…"
            maxLength={MAX_QUESTION_LENGTH}
            disabled={loading}
            aria-label="Câu hỏi"
          />
          <button type="submit" disabled={loading || !question.trim()}>
            Gửi
          </button>
        </form>
      </main>
    </div>
  );
}
