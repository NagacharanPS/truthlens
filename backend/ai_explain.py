from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, List, Optional
from pydantic import BaseModel, Field
from starlette.config import Config

BASE_DIR = Path(__file__).resolve().parent
CONFIG = Config(str(BASE_DIR / ".env"))

PLACEHOLDER_KEYS = {"", "your_groq_api_key_here", "your_api_key_here", "None"}

class ChatMessage(BaseModel):
    role: str = "user"  # "user" or "assistant" or "system"
    content: str

class ExplanationRequest(BaseModel):
    verification: dict[str, Any] = Field(default_factory=dict)
    user_query: Optional[str] = None
    chat_history: Optional[List[ChatMessage]] = Field(default_factory=list)


def get_groq_api_key() -> str | None:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        try:
            api_key = CONFIG("GROQ_API_KEY", cast=str, default="")
        except Exception:
            api_key = ""
    api_key = (api_key or "").strip()
    if api_key in PLACEHOLDER_KEYS:
        return None
    return api_key


def is_valid_verification(v: dict[str, Any] | None) -> bool:
    if not v or not isinstance(v, dict):
        return False
    # Check for core verification fields
    return any(k in v for k in ["riskScore", "status", "riskLevel", "redFlags"]) and (
        v.get("riskScore") is not None or v.get("status") is not None
    )


def generate_no_verification_message() -> str:
    return (
        "### ⚠️ No Verification Found Yet\n\n"
        "You haven't run a verification scan yet. Please go to the **Text**, **Image**, or **URL** "
        "verification module above, submit your input, and click **Verify**.\n\n"
        "Once verified, I will analyze the results, break down the risk scores, explain the red flags, "
        "and provide customized step-by-step solutions for you!"
    )


def generate_fallback_explanation(data: ExplanationRequest) -> str:
    """Generate a detailed, intelligent local analytics breakdown and response

    when Groq LLM API is unavailable or offline.
    """
    v = data.verification or {}
    user_q = (data.user_query or "").strip().lower()

    if not is_valid_verification(v):
        return generate_no_verification_message()

    scan_type = v.get("type", "content").upper()
    risk_score = v.get("riskScore", 0)
    risk_level = v.get("riskLevel", "Unknown")
    status = v.get("status", "Verified")
    confidence = v.get("confidence", 0)
    red_flags = v.get("redFlags", [])
    recommendation = v.get("recommendation", "")
    persuasion_patterns = v.get("persuasionPatterns", [])
    persuasion_score = v.get("persuasionScore", 0)
    signals = v.get("signalBreakdown", [])
    c2pa_verified = v.get("c2paVerified", False)
    c2pa_gen = v.get("c2paGenerator", "")
    clip_score = v.get("clipAiScore", 0)

    # If user is asking specifically about solutions or next steps
    if any(k in user_q for k in ["solution", "what to do", "how to fix", "prevent", "remedy", "advice", "steps", "action"]):
        lines = [
            f"### 🛡️ Recommended Solutions & Action Plan ({risk_level} Risk {scan_type})",
            "",
            f"**Primary Safety Directive:** {recommendation if recommendation else 'Treat this item with high caution.'}",
            "",
            "#### Step-by-Step Remediation Steps:",
        ]
        if scan_type == "TEXT":
            lines.extend([
                "1. **Do NOT Respond or Click Links:** Never reply to the message, confirm personal details, or open attached URLs.",
                "2. **Verify via Official Out-of-Band Channels:** Call the organization or institution directly using phone numbers from their official website, not numbers provided in the text.",
                "3. **Never Share Credentials or OTPs:** Legitimate banks and support teams will never ask for your passwords, one-time codes, or PINs.",
                "4. **Block & Report:** Report the sender's number/email to your carrier and block the sender in your messaging client.",
                "5. **Secure Compromised Accounts:** If you already clicked or replied, change your passwords immediately and enable Multi-Factor Authentication (MFA)."
            ])
        elif scan_type == "URL":
            lines.extend([
                "1. **Do NOT Navigate or Enter Data:** Avoid opening the domain or submitting login credentials, credit card details, or forms.",
                "2. **Check Domain Integrity:** Compare the domain spelling against the authentic brand URL (watch for subtle typos, weird TLDs, and extra subdomains).",
                "3. **Clear Browser Cache & Session:** If you visited the site, clear cookies and history, and close all open browser tabs.",
                "4. **Run an Endpoint Malware Scan:** If you downloaded any files from the link, run an antivirus / anti-malware scan immediately.",
                "5. **Report Phishing:** Submit the malicious link to Google Safe Browsing and your organization's IT security team."
            ])
        else:  # IMAGE
            lines.extend([
                "1. **Do NOT Trust as Verified Evidence:** Do not circulate or rely on this media without independent provenance confirmation.",
                "2. **Reverse Image Search:** Search the image on Google Images, TinEye, or Yandex to trace its earliest appearance and original source.",
                "3. **Inspect C2PA / Metadata:** Check if Content Credentials (C2PA) or metadata identify the image as AI-generated or manipulated.",
                "4. **Look for Visual Inconsistencies:** Check for anatomical anomalies, unnatural textures, mismatched lighting, and blended backgrounds.",
                "5. **Source Verification:** Rely on verified news agencies and authoritative publishers for factual reporting."
            ])
        return "\n".join(lines)

    # General / "explain analytics" overview
    detected_lang = v.get("detectedLanguage") or v.get("metadata", {}).get("detectedLanguage")
    lang_code = v.get("detectedLanguageCode") or v.get("metadata", {}).get("detectedLanguageCode")
    ocr_text = v.get("ocrText") or v.get("metadata", {}).get("ocrText")

    lines = [
        f"### 📊 TruthLens Deep Analytics Breakdown: {scan_type} Scan",
        "",
        f"- **Overall Risk Level:** **{risk_level}** ({risk_score}/100 Risk Score)",
        f"- **Classification Status:** `{status}` (Confidence: {confidence}%)",
    ]

    if detected_lang:
        lines.append(f"- **Language & Script:** **{detected_lang}** ({lang_code or 'auto'})")

    lines.extend([
        "",
        "#### 🔍 Key Findings & Risk Factors:",
    ])

    if ocr_text:
        lines.append(f"- **OCR Extracted Text:** \"{ocr_text}\"")

    if red_flags and red_flags != ["No major red flags detected"]:
        lines.append(f"- **Identified Red Flags:** {', '.join(red_flags[:6])}")
    else:
        lines.append("- **Identified Red Flags:** No critical red flags detected.")

    if signals:
        top_signals = [f"{s.get('label')}: {s.get('value')}%" for s in signals if isinstance(s, dict)]
        if top_signals:
            lines.append(f"- **Signal Breakdown:** {', '.join(top_signals)}")

    if persuasion_patterns:
        lines.append(f"- **Psychological Manipulation Detected:** {', '.join(persuasion_patterns)} (Persuasion Score: {persuasion_score}/100)")

    if scan_type == "IMAGE":
        if clip_score:
            lines.append(f"- **CLIP AI Synthetic Score:** {clip_score}% synthetic likelihood.")
        if c2pa_gen:
            lines.append(f"- **C2PA Provenance Generator:** `{c2pa_gen}` ({'Verified' if c2pa_verified else 'Unverified'})")

    lines.extend([
        "",
        "#### 💡 Why This Score Was Assigned:",
        f"{v.get('explanation', 'Analytics calculated through multi-signal correlation of neural models and rule-based heuristics.')}",
        "",
        "#### 🛡️ Recommendation:",
        f"> {recommendation or 'Exercise standard caution when evaluating external content.'}",
        "",
        "*You can ask me follow-up questions like 'What is the solution?', 'How can I stay safe?', or ask about any specific signal.*"
    ])

    return "\n".join(lines)


def generate_explanation(data: ExplanationRequest) -> str:
    """Generate a natural-language explanation using Groq LLM with multi-turn support,

    falling back to local intelligent analytics breakdown when offline.
    """
    v = data.verification or {}
    has_verification = is_valid_verification(v)
    user_query = data.user_query.strip() if data.user_query else "Please explain the verification analytics in detail and give me the recommended solution."
    is_analytics_request = any(k in user_query.lower() for k in ["analytics", "explain", "why", "score", "flag", "risk", "solution", "what to do", "protect"])

    # If there is no verification and the user is asking to explain analytics or solutions for a scan
    if not has_verification and is_analytics_request:
        return generate_no_verification_message()

    groq_api_key = get_groq_api_key()

    if not groq_api_key:
        return generate_fallback_explanation(data)

    try:
        from groq import Groq
        groq_model = CONFIG("GROQ_MODEL", cast=str, default="llama-3.3-70b-versatile")
        client = Groq(api_key=groq_api_key)

        system_prompt = (
            "You are the TruthLens Intelligent AI Security Assistant. "
            "You are an expert in disinformation analysis, phishing detection, multimodal image forensics, "
            "psychological manipulation triggers, and cybersecurity threat mitigation.\n\n"
            "IMPORTANT RULE: If the JSON verification result is empty or no verification has been performed, "
            "and the user asks to explain analytics or results, you MUST tell them clearly that no verification has "
            "happened yet and ask them to verify their text, URL, or image first.\n\n"
            "When verification analytics are present:\n"
            "1. Give a clear summary of the Risk Level, Risk Score, and Classification Status.\n"
            "2. Break down why the red flags, signals, persuasion patterns, or forensic markers triggered.\n"
            "3. Provide practical, clear, actionable security solutions and advice.\n\n"
            "When the user asks questions (such as 'what is the solution?', 'is this dangerous?', 'how do I protect myself?'):\n"
            "Directly provide specific, prioritized, step-by-step actionable solutions based on the verification context.\n\n"
            "Format your answers with clean Markdown (headings, bullet points, bold text)."
        )

        verification_context = (
            f"=== CURRENT VERIFICATION RESULT JSON ===\n{json.dumps(v, indent=2)}\n========================================"
            if has_verification else "=== NO VERIFICATION SCAN LOADED YET ==="
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "system", "content": verification_context},
        ]

        # Append previous conversation turns if provided
        if data.chat_history:
            for msg in data.chat_history[-8:]:  # keep last 8 messages for context
                if msg.role in {"user", "assistant"}:
                    messages.append({"role": msg.role, "content": msg.content})

        messages.append({"role": "user", "content": user_query})

        response = client.chat.completions.create(
            model=groq_model,
            messages=messages,
            temperature=0.3,
            max_tokens=850,
        )
        return response.choices[0].message.content.strip()

    except Exception as exc:
        fallback = generate_fallback_explanation(data)
        return f"{fallback}\n\n*(Note: Groq LLM service returned: {exc}. Displayed local forensic analytics breakdown instead.)*"
