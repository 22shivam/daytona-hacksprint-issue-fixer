import { NextPage } from 'next';
import Head from 'next/head';

const Home: NextPage = () => {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <Head>
        <title>AutoFixer - GitHub Issue Handler</title>
      </Head>
      <h1>AutoFixer</h1>
      <p>GitHub webhook endpoint is ready at: <code>/api/github-webhook</code></p>
      <p>This service automatically creates Daytona sandboxes when GitHub issues are opened.</p>
    </div>
  );
};

export default Home;

