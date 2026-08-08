interface AuthErrorLike {
  code?: string | null;
  message?: string;
}

const FALLBACK_MESSAGE =
  "Something went wrong. Please try again in a moment.";

const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials:
    "This account doesn't exist or the password is incorrect. If you don't have an account yet, please sign up.",
  invalid_login_credentials:
    "This account doesn't exist or the password is incorrect. If you don't have an account yet, please sign up.",
  email_not_confirmed:
    "Your email isn't confirmed yet. Please check your inbox for the confirmation link.",
  email_exists:
    "An account with this email already exists. Try signing in instead.",
  user_already_exists:
    "An account with this email already exists. Try signing in instead.",
  signup_disabled:
    "Signups are currently unavailable. Please try again later.",
  weak_password: "Password must be at least 8 characters long.",
  same_password:
    "New password must be different from your current password.",
  otp_expired:
    "That link has expired. Please request a new one.",
  flow_state_not_found:
    "That link is invalid or has expired. Please try again.",
  flow_state_expired:
    "That link is invalid or has expired. Please try again.",
  invalid_otp:
    "That code is invalid or has expired. Please try again.",
  user_not_found:
    "No account found with this email. Please sign up first.",
  valid_last_sign_in_at:
    "For security, you can only set a password shortly after signing in. Sign out and sign back in, then try again.",
  over_email_send_rate_limit:
    "You're sending requests too quickly. Please wait a moment and try again.",
  over_request_rate_limit:
    "Too many attempts. Please wait a moment and try again.",
  not_authenticated:
    "Your session has expired. Please sign in again.",
  unexpected_failure: FALLBACK_MESSAGE,
};

const NETWORK_MESSAGE =
  "Something went wrong. Check your connection and try again.";

export function friendlyAuthMessage(error: AuthErrorLike | null): string {
  if (!error) return "";
  if (error.code && CODE_MESSAGES[error.code]) {
    return CODE_MESSAGES[error.code];
  }

  const message = (error.message ?? "").toLowerCase();
  if (
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return CODE_MESSAGES.invalid_credentials;
  }
  if (message.includes("security purposes")) {
    return CODE_MESSAGES.valid_last_sign_in_at;
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("fetch failed") ||
    message.includes("load failed")
  ) {
    return NETWORK_MESSAGE;
  }

  if (!error.message) {
    return FALLBACK_MESSAGE;
  }
  return error.message;
}
