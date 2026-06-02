/**
 * Minimal status landing page. Not required for telephony, but handy to confirm
 * the deployment is live and to surface the webhook URLs to configure in Twilio.
 */

export async function getServerSideProps({ req }) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const base = process.env.PUBLIC_BASE_URL || `${proto}://${host}`;
  return { props: { base } };
}

export default function Home({ base }) {
  const rows = [
    ['Inbound (A CALL COMES IN)', 'POST', `${base}/api/voice/inbound`],
    ['Turn handler (auto)', 'POST', `${base}/api/voice/turn`],
    ['Status callback (optional)', 'POST', `${base}/api/voice/status`],
    ['Health check', 'GET', `${base}/api/health`],
  ];
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '40px auto', padding: '0 16px', lineHeight: 1.5 }}>
      <h1>AI Voice Receptionist</h1>
      <p>Multi-tenant AI phone receptionist — Twilio + Vercel + LLM. The service is running.</p>
      <h2>Twilio webhook URLs</h2>
      <p>Configure these on your Twilio phone number(s):</p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={th}>Purpose</th>
            <th style={th}>Method</th>
            <th style={th}>URL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([p, m, u]) => (
            <tr key={u}>
              <td style={td}>{p}</td>
              <td style={td}>{m}</td>
              <td style={td}><code>{u}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 24, color: '#666' }}>
        See <code>README.md</code> for full setup and deployment instructions.
      </p>
    </main>
  );
}

const th = { textAlign: 'left', borderBottom: '2px solid #ddd', padding: '8px 6px' };
const td = { borderBottom: '1px solid #eee', padding: '8px 6px', verticalAlign: 'top' };
