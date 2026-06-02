export const DEFAULT_TEMPLATE_MJML = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="16px" color="#333333" line-height="1.6" />
    </mj-attributes>
  </mj-head>

  <mj-body background-color="#F4F4F4">
    <mj-section background-color="#FFFFFF" padding="32px 40px">
      <mj-column>
        <mj-text font-size="28px" font-weight="bold" color="#1A1A1A" align="center">
          New Template
        </mj-text>
        <mj-text align="center" color="#555555">
          Start editing your template here.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/** Starter MJML for new AJO expression fragments (compiled to HTML on sync). */
export const DEFAULT_FRAGMENT_MJML = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text align="center" font-size="12px" color="#71717a" line-height="1.5">
          © {{profile.system.year}} Acme Corp. All rights reserved.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;
