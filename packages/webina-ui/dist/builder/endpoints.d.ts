/** Server API surface for the shared form widget. ERP: /v1/public/forms (Marketing). Dashboard passes its own prefix. */
export type FormEndpoints = {
    /** GET → `{ data: { fields: [...] } }`; feed `data.fields` to `fieldsFromDefinition`. */
    definition: (formKey: string) => string;
    /** POST JSON payload from `visiblePayload`. */
    submit: (formKey: string) => string;
    /** POST multipart `file` → token stored as the field value. */
    upload: (formKey: string) => string;
};
export declare function publicFormEndpoints(apiBase: string, prefix?: string): FormEndpoints;
//# sourceMappingURL=endpoints.d.ts.map