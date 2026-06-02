/**
 * Human-like fallback responses for when the AI/LLM is unavailable or input
 * cannot be understood. Keeps the call graceful instead of dropping silently.
 */

function aiFailureFallback(tenant) {
  return (
    tenant.fallback_message ||
    `I'm sorry, I'm having a little trouble right now. Could you please repeat that, or I can have someone from ${tenant.business_name} call you back shortly?`
  );
}

function noInputFallback(tenant, attempt) {
  if (attempt <= 1) {
    return "Sorry, I didn't catch that. Could you say that again?";
  }
  if (attempt === 2) {
    return "I'm still not hearing you. Please tell me how I can help.";
  }
  return `I'm having trouble hearing you, so I'll let you go for now. Please call ${tenant.business_name} back any time. Goodbye!`;
}

function unclearInputFallback() {
  return "I'm sorry, I didn't quite understand. Could you rephrase that for me?";
}

function repeatedQuestionFallback() {
  return "It sounds like I may not have answered that well. Let me try again — could you tell me a bit more about what you need?";
}

function angryUserResponse(tenant) {
  return `I completely understand your frustration, and I'm sorry for the trouble. I want to help — would you like me to take down your details so someone from ${tenant.business_name} can call you right back?`;
}

function genericGreeting(tenant) {
  return tenant.greeting || `Thank you for calling ${tenant.business_name}. How can I help you today?`;
}

function noTenantResponse() {
  return "Thanks for calling. This number isn't configured yet, so I can't take your request right now. Please try again later. Goodbye!";
}

module.exports = {
  aiFailureFallback,
  noInputFallback,
  unclearInputFallback,
  repeatedQuestionFallback,
  angryUserResponse,
  genericGreeting,
  noTenantResponse,
};
