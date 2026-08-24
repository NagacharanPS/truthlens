from fastapi import APIRouter
from .ai_explain import generate_explanation, ExplanationRequest

router = APIRouter()

@router.post("/api/explain")
def explain(payload: ExplanationRequest):
    """Generate AI explanation for verification result.
    Returns a dict with 'explanation' key.
    """
    explanation = generate_explanation(payload)
    return {"explanation": explanation}
