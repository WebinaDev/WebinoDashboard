/** Shared form model (ERP + Dashboard). Types include `heading` (group title, no input) and `file` (private upload, value = token).
 * Pro form model: `label|name|type|options|required|step|showIf` per line (first three columns = legacy format). */
export type FormFieldType = "text" | "email" | "tel" | "number" | "textarea" | "select" | "radio" | "checkbox" | "date" | "file" | "heading";
export type FormField = {
    label: string;
    name: string;
    type: FormFieldType;
    options: string[];
    required: boolean;
    step: number;
    showIf?: {
        name: string;
        value: string;
    };
};
export declare const FORM_FIELD_TYPES: FormFieldType[];
export declare function parseFormFields(raw: unknown): FormField[];
export declare function isVisible(field: FormField, values: Record<string, string>): boolean;
export declare function stepCount(fields: FormField[]): number;
/** Names of visible required fields on `step` that are still empty. */
export declare function missingOnStep(fields: FormField[], values: Record<string, string>, step: number): string[];
/** Payload sent to the server: only visible fields. */
export declare function visiblePayload(fields: FormField[], values: Record<string, string>): Record<string, string>;
/** Marketing form definition (`marketing_forms.fields`) → builder fields, so a widget can use the form's own schema. */
export declare function fieldsFromDefinition(raw: unknown): FormField[];
//# sourceMappingURL=forms.d.ts.map