import { Check, X } from "lucide-react";

export function validatePassword(password: string) {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const isValid = minLength && hasUpper && hasLower && hasNumber && hasSpecial;
  return {
    minLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    isValid,
  };
}

export function PasswordRequirements({ password }: { password?: string }) {
  const rules = [
    { label: "Minimum 8 characters", met: (password?.length ?? 0) >= 8 },
    { label: "At least 1 uppercase letter", met: /[A-Z]/.test(password || "") },
    { label: "At least 1 lowercase letter", met: /[a-z]/.test(password || "") },
    { label: "At least 1 number", met: /[0-9]/.test(password || "") },
    { label: "At least 1 special character", met: /[^A-Za-z0-9]/.test(password || "") },
  ];

  const isInteractive = password !== undefined && password.length > 0;

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-2.5 text-xs text-muted-foreground space-y-1.5 mt-1.5">
      <div className="font-medium text-foreground/80 text-[11px] uppercase tracking-wider">
        Password requirements:
      </div>
      <ul className="space-y-1">
        {rules.map((rule, idx) => (
          <li
            key={idx}
            className={`flex items-center gap-1.5 transition-colors ${
              isInteractive
                ? rule.met
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
                : "text-muted-foreground"
            }`}
          >
            {isInteractive ? (
              rule.met ? (
                <Check className="h-3 w-3 text-primary shrink-0" />
              ) : (
                <X className="h-3 w-3 text-muted-foreground/60 shrink-0" />
              )
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0 ml-0.5 mr-1" />
            )}
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
