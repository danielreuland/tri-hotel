-- Einstellungen der Anwendung, die der Admin ohne Server-Zugriff ändert (14.11.2026). Erster Wert: das KI-Monatsbudget
-- (llm_monthly_budget_usd). Ohne Eintrag gilt weiter der Wert aus der .env (LLM_MONTHLY_BUDGET_USD).
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
