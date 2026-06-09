import type { TemplateDefinition, TemplateSourceFormat } from './types.js';

export type { TemplateSourceFormat };

export const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{{cf.subject | default: "New Email"}}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;">
          <tr>
            <td style="padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:28px;color:#1a1a1a;">New Template</h1>
              <p style="margin:16px 0 0;font-size:16px;color:#555;">Start editing your HTML template here.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export function getTemplateSourceFormat(definition: TemplateDefinition): TemplateSourceFormat {
	return definition.sourceFormat === 'html' ? 'html' : 'mjml';
}

/** Detect format from markup when metadata is missing or stale. */
export function inferSourceFormatFromContent(source: string): TemplateSourceFormat | null {
	const trimmed = source.trim();
	if (!trimmed) return null;
	if (/<mj[\w-]/i.test(trimmed)) return 'mjml';
	if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return 'html';
	if (/<\/html>/i.test(trimmed)) return 'html';
	if (/<(?:table|body|center|div)[\s>]/i.test(trimmed)) return 'html';
	return null;
}

export function resolveTemplateSourceFormat(
	source: string,
	opts: { sourceFormat?: TemplateSourceFormat; definition?: TemplateDefinition } = {}
): TemplateSourceFormat {
	if (opts.sourceFormat) return opts.sourceFormat;
	const inferred = inferSourceFormatFromContent(source);
	if (opts.definition) {
		const fromDefinition = getTemplateSourceFormat(opts.definition);
		if (fromDefinition === 'html') return 'html';
		if (inferred === 'html') return 'html';
		return fromDefinition;
	}
	return inferred ?? 'mjml';
}

export function defaultTemplateSource(format: TemplateSourceFormat): string {
	return format === 'html' ? DEFAULT_HTML_TEMPLATE : '';
}
