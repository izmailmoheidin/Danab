export type PaymentMethod = "EVC Plus" | "ZAAD" | "SAHAL";

export type PaymentStatus = "processing" | "success" | "failed";
export type ProcessingStep = "verify" | "charge" | "unlock";

export type PaymentErrors = {
  phone?: string;
  agreeRules?: string;
};

export type TimeOption = {
  label: string;
  amount: number;
  icon: "clock" | "timer";
};
