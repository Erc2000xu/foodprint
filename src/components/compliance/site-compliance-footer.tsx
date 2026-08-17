import { MIIT_FILING_URL, resolveIcpRecord } from "@/lib/compliance/icp";

export function SiteComplianceFooter() {
  const icpRecord = resolveIcpRecord();

  return (
    <footer className="site-compliance-footer" aria-label="网站备案信息">
      <a
        className="site-compliance-footer__record"
        href={MIIT_FILING_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {icpRecord}
      </a>
      <a
        className="site-compliance-footer__query-link"
        href={MIIT_FILING_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        工信部备案查询
      </a>
    </footer>
  );
}
