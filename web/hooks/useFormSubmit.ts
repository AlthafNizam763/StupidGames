'use client';

import { useState } from 'react';
import { ApiError, toUserMessage } from '@/services/http';

/**
 * Form submission with server-driven errors.
 *
 * The server is the authority on validity, so its `FieldError[]` is mapped
 * straight onto the fields rather than being re-derived from a second set of
 * client-side rules. Duplicating validation is how a form ends up accepting
 * something the server rejects, or rejecting something it would accept.
 */
export interface FormSubmitState {
  pending: boolean;
  /** An error about the submission as a whole. */
  formError: string | null;
  /** Errors keyed by field name, from the server's `errors` array. */
  fieldErrors: Record<string, string>;
}

export function useFormSubmit<TValues>(action: (values: TValues) => Promise<void>) {
  const [state, setState] = useState<FormSubmitState>({
    pending: false,
    formError: null,
    fieldErrors: {},
  });

  async function submit(values: TValues): Promise<boolean> {
    setState({ pending: true, formError: null, fieldErrors: {} });

    try {
      await action(values);
      setState({ pending: false, formError: null, fieldErrors: {} });
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrorMap();
        setState({
          pending: false,
          // When every problem is attached to a field, the fields say it
          // already - a banner repeating the same thing is just noise.
          formError: Object.keys(fieldErrors).length > 0 ? null : error.message,
          fieldErrors,
        });
      } else {
        setState({ pending: false, formError: toUserMessage(error), fieldErrors: {} });
      }
      return false;
    }
  }

  function clearErrors(): void {
    setState((current) => ({ ...current, formError: null, fieldErrors: {} }));
  }

  return { ...state, submit, clearErrors };
}
