export type ToastVariant = "warn" | "error" | "success";

type AddToastFn = (message: string, variant: ToastVariant) => void;

let _handler: AddToastFn | null = null;

export function setToastHandler(fn: AddToastFn) {
  _handler = fn;
}

export function toast(message: string, variant: ToastVariant = "error") {
  if (_handler) {
    _handler(message, variant);
  } else {
    console.error(`[toast] ${variant}: ${message}`);
  }
}
