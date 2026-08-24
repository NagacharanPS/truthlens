"""
WHOIS domain age checker for URL verification.

Domain registration age is one of the strongest phishing signals:
- Phishing domains are almost always registered within the last 30 days
- Legitimate banks, services, and brands have domains registered years ago

Falls back gracefully if WHOIS lookup fails (timeout, rate limit, private reg).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Domains that are always trusted regardless of age
ALWAYS_TRUSTED_DOMAINS = {
    "google.com", "microsoft.com", "apple.com", "amazon.com",
    "paypal.com", "facebook.com", "instagram.com", "twitter.com",
    "x.com", "github.com", "linkedin.com", "netflix.com",
    "youtube.com", "wikipedia.org", "cloudflare.com",
}


@dataclass
class WhoisResult:
    available: bool
    domain: str
    age_days: int | None          # None if lookup failed
    registered_on: str | None     # ISO date string
    registrar: str | None
    is_new_domain: bool           # True if < 90 days old
    is_very_new: bool             # True if < 30 days old
    risk_score_delta: int         # adjustment to apply to URL risk score
    risk_label: str               # "new domain" | "established" | "unknown"
    summary: str
    error: str | None = None


def _get_base_domain(host: str) -> str:
    """Strip subdomains — check whois on the registrable domain."""
    parts = host.lower().split(".")
    if len(parts) <= 2:
        return host.lower()
    # Handle common two-part TLDs like co.uk, com.au
    two_part_tlds = {"co.uk", "com.au", "co.in", "co.nz", "org.uk", "net.au"}
    if len(parts) >= 3 and f"{parts[-2]}.{parts[-1]}" in two_part_tlds:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def check_domain_age(host: str) -> WhoisResult:
    """
    Look up WHOIS data for the host and return domain age information.
    """
    base_domain = _get_base_domain(host)

    # Skip WHOIS for always-trusted domains
    if base_domain in ALWAYS_TRUSTED_DOMAINS:
        return WhoisResult(
            available=True,
            domain=base_domain,
            age_days=None,
            registered_on=None,
            registrar=None,
            is_new_domain=False,
            is_very_new=False,
            risk_score_delta=-10,
            risk_label="trusted domain",
            summary=f"{base_domain} is a well-known trusted domain.",
        )

    try:
        import whois  # type: ignore

        data = whois.whois(base_domain)
        creation_date = data.creation_date

        # creation_date can be a list or a single datetime
        if isinstance(creation_date, list):
            creation_date = creation_date[0]

        if creation_date is None:
            return WhoisResult(
                available=True,
                domain=base_domain,
                age_days=None,
                registered_on=None,
                registrar=str(data.registrar or ""),
                is_new_domain=False,
                is_very_new=False,
                risk_score_delta=5,
                risk_label="unknown age",
                summary="Domain registration date could not be determined.",
            )

        # Normalize to UTC-aware datetime
        if creation_date.tzinfo is None:
            creation_date = creation_date.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        age_days = (now - creation_date).days
        registered_on = creation_date.strftime("%Y-%m-%d")
        registrar = str(data.registrar or "").strip()[:80]

        is_very_new = age_days < 30
        is_new_domain = age_days < 90

        if is_very_new:
            risk_score_delta = 25
            risk_label = "very new domain"
            summary = f"Domain registered only {age_days} days ago — extremely common in phishing attacks."
        elif is_new_domain:
            risk_score_delta = 15
            risk_label = "new domain"
            summary = f"Domain registered {age_days} days ago — recently registered domains carry higher risk."
        elif age_days < 365:
            risk_score_delta = 5
            risk_label = "young domain"
            summary = f"Domain is {age_days} days old — less than one year."
        else:
            years = age_days // 365
            risk_score_delta = -5
            risk_label = "established domain"
            summary = f"Domain has been registered for {years} year{'s' if years != 1 else ''} — established."

        return WhoisResult(
            available=True,
            domain=base_domain,
            age_days=age_days,
            registered_on=registered_on,
            registrar=registrar or None,
            is_new_domain=is_new_domain,
            is_very_new=is_very_new,
            risk_score_delta=risk_score_delta,
            risk_label=risk_label,
            summary=summary,
        )

    except Exception as exc:
        logger.warning("[WHOIS] Lookup failed for %s: %s", base_domain, exc)
        return WhoisResult(
            available=False,
            domain=base_domain,
            age_days=None,
            registered_on=None,
            registrar=None,
            is_new_domain=False,
            is_very_new=False,
            risk_score_delta=0,
            risk_label="lookup failed",
            summary="WHOIS lookup was unavailable for this domain.",
            error=str(exc),
        )
