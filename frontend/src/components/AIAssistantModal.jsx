import { useEffect, useRef, useState } from "react";
import { explainAnalytics } from "../services/api";
import "./aiAssistant.css";

function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(date);
}

// Simple safe markdown-like formatting for assistant answers
function renderFormattedMessage(content) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements = [];
  let inList = false;
  let listItems = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {listItems.map((li, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: formatInline(li) }} />
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const formatInline = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={index}>{trimmed.replace("### ", "")}</h3>);
    } else if (trimmed.startsWith("#### ")) {
      flushList();
      elements.push(<h4 key={index}>{trimmed.replace("#### ", "")}</h4>);
    } else if (trimmed.startsWith("> ")) {
      flushList();
      elements.push(
        <blockquote
          key={index}
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed.replace("> ", "")) }}
        />
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      inList = true;
      listItems.push(trimmed.slice(2));
    } else if (/^\d+\.\s/.test(trimmed)) {
      inList = true;
      listItems.push(trimmed.replace(/^\d+\.\s/, ""));
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p
          key={index}
          dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }}
        />
      );
    }
  });

  flushList();
  return elements;
}

function AIAssistantModal({ isOpen, onClose, activeVerification, defaultPrompt = null }) {
  const currentResult = activeVerification?.result || activeVerification;
  const hasActiveResult = Boolean(
    currentResult && (currentResult.riskScore !== undefined || currentResult.status || currentResult.riskLevel)
  );

  const getInitialWelcomeMessage = () => {
    if (hasActiveResult) {
      const type = (currentResult.type || "Content").toUpperCase();
      const risk = currentResult.riskLevel || "Analyzed";
      const score = currentResult.riskScore ?? 0;
      return {
        id: "welcome-1",
        role: "assistant",
        content: `Hello! I have loaded your **${type} verification analytics** (${risk} Risk, Score: ${score}%).`,
        time: formatTimestamp(),
      };
    }
    return {
      id: "welcome-1",
      role: "assistant",
      content:
        "Hello! I am your **TruthLens AI Security Assistant**.\n\n⚠️ **Still verification not happened:** You haven't run a verification scan yet. Please go to the **Text**, **Image**, or **URL** verification tab above, enter your content, and click **Verify**.",
      time: formatTimestamp(),
    };
  };

  const [messages, setMessages] = useState([getInitialWelcomeMessage()]);
  const [inputQuery, setInputQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Update welcome message when activeVerification changes
  useEffect(() => {
    if (messages.length === 1 && messages[0].id === "welcome-1") {
      setMessages([getInitialWelcomeMessage()]);
    }
  }, [hasActiveResult]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        scrollToBottom();
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (customQuery = null) => {
    const queryToSend = (customQuery || inputQuery).trim();
    if (!queryToSend || isLoading) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: queryToSend,
      time: formatTimestamp(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery("");
    setIsLoading(true);

    try {
      const chatHistory = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      const verificationPayload = currentResult || {};

      const explanation = await explainAnalytics({
        verification: verificationPayload,
        userQuery: queryToSend,
        chatHistory,
      });

      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: explanation,
        time: formatTimestamp(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          role: "assistant",
          content:
            "I encountered a temporary issue generating the response. Please try again or ask a more specific question.",
          time: formatTimestamp(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetChat = () => {
    setMessages([getInitialWelcomeMessage()]);
  };

  if (!isOpen) return null;

  return (
    <div className="ai-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="ai-chat-window" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="ai-chat-header">
          <div className="ai-chat-header-info">
            <div className="ai-chat-avatar">🛡️</div>
            <div>
              <h3 className="ai-chat-title">TruthLens AI Assistant</h3>
              <p className="ai-chat-status">
                <span className="ai-chat-status-dot"></span>
                Intelligent Forensic Explainer
              </p>
            </div>
          </div>
          <div className="ai-chat-header-actions">
            <button
              type="button"
              className="ai-chat-btn-ghost"
              onClick={handleResetChat}
              title="Reset conversation"
            >
              Clear
            </button>
            <button
              type="button"
              className="ai-chat-close-btn"
              onClick={onClose}
              aria-label="Close Assistant"
            >
              &times;
            </button>
          </div>
        </header>

        {/* Active Context Bar */}
        <div className="ai-context-banner">
          {hasActiveResult ? (
            <>
              <span className="ai-context-pill">
                Scan: {(currentResult.type || "Content").toUpperCase()}
              </span>
              <span className="ai-context-pill">
                Risk: {currentResult.riskLevel || "N/A"} ({currentResult.riskScore ?? 0}%)
              </span>
              {(currentResult.detectedLanguage || currentResult.metadata?.detectedLanguage) && (
                <span className="ai-context-pill">
                  🌐 {currentResult.detectedLanguage || currentResult.metadata?.detectedLanguage}
                </span>
              )}
            </>
          ) : (
            <span style={{ color: "#facc15" }}>
              ⚠️ No verification scan loaded — go to verification tabs to analyze content
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="ai-chat-messages">
          {messages.map((msg) => (
            <div key={msg.id} className={`ai-msg ${msg.role}`}>
              <div className="ai-msg-avatar">
                {msg.role === "assistant" ? "🛡️" : "👤"}
              </div>
              <div className="ai-msg-body">
                {msg.role === "assistant"
                  ? renderFormattedMessage(msg.content)
                  : <p>{msg.content}</p>}
                <div className="ai-msg-time">{msg.time}</div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="ai-msg assistant">
              <div className="ai-msg-avatar">🛡️</div>
              <div className="ai-typing-indicator">
                <span>Analyzing threat signals</span>
                <span className="ai-typing-dot"></span>
                <span className="ai-typing-dot"></span>
                <span className="ai-typing-dot"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="ai-chips-shelf">
          {hasActiveResult ? (
            <>
              <button
                type="button"
                className="ai-chip"
                onClick={() => handleSendMessage("Explain analytics in detail")}
                disabled={isLoading}
              >
                📊 Analytics Explanation
              </button>
              <button
                type="button"
                className="ai-chip"
                onClick={() => handleSendMessage("What is the solution and how do I protect myself?")}
                disabled={isLoading}
              >
                🛡️ Solution & Steps
              </button>
              <button
                type="button"
                className="ai-chip"
                onClick={() => handleSendMessage("Why is this item flagged with this risk score?")}
                disabled={isLoading}
              >
                ⚠️ Why is it risky?
              </button>
              <button
                type="button"
                className="ai-chip"
                onClick={() => handleSendMessage("Can you summarize the red flags?")}
                disabled={isLoading}
              >
                🔍 Summarize Red Flags
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="ai-chip"
                onClick={() => handleSendMessage("How does TruthLens verification work?")}
                disabled={isLoading}
              >
                ❓ How verification works
              </button>
              <button
                type="button"
                className="ai-chip"
                onClick={() => handleSendMessage("What are common signs of phishing and scams?")}
                disabled={isLoading}
              >
                🛡️ Common scam signs
              </button>
              <button
                type="button"
                className="ai-chip"
                onClick={() => handleSendMessage("How can I protect my personal data online?")}
                disabled={isLoading}
              >
                🔒 Best safety tips
              </button>
            </>
          )}
        </div>

        {/* Chat Input */}
        <div className="ai-chat-input-area">
          <form
            className="ai-chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="ai-chat-input"
              placeholder="Ask about analytics, solutions, or threat details..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="ai-chat-send-btn"
              disabled={!inputQuery.trim() || isLoading}
              aria-label="Send message"
            >
              ➤
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AIAssistantModal;
