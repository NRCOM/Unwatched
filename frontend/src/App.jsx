import { useState, useEffect, useCallback } from 'react';
import { Layout, Typography, message, Button, Space, Tooltip } from 'antd';
import { RightOutlined, LeftOutlined, GithubOutlined } from '@ant-design/icons';
import SearchPanel from './components/SearchPanel';
import ResultsTable from './components/ResultsTable';
import MediaDrawer from './components/MediaDrawer';
import { getUsers, getGenres, search } from './services/api';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

export default function App() {
  const [users, setUsers] = useState([]);
  const [genres, setGenres] = useState({ all: [], movies: [], shows: [], contentRatings: [], diskPaths: [] });
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [includeWatchCount, setIncludeWatchCount] = useState(false);
  const [drawerItem, setDrawerItem] = useState(null);
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    Promise.all([getUsers(), getGenres()])
      .then(([u, g]) => {
        setUsers(u);
        setGenres(g);
      })
      .catch((err) => {
        messageApi.error(`Failed to load initial data: ${err.message}`);
      });
  }, []);

  const handleSearch = useCallback(async (filters) => {
    setSearching(true);
    setSearched(false);
    setIncludeWatchCount(Boolean(filters.includeWatchCount));
    try {
      const data = await search(filters);
      setResults(data);
      setSearched(true);
    } catch (err) {
      messageApi.error(`Search failed: ${err.message}`);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleItemsDeleted = useCallback((items) => {
    const toDelete = new Set((items ?? []).map((item) => `${item.type}-${item.id}`));
    if (toDelete.size === 0) return;
    setResults((prev) => prev.filter((item) => !toDelete.has(`${item.type}-${item.id}`)));
    setDrawerItem((current) => {
      if (!current) return current;
      return toDelete.has(`${current.type}-${current.id}`) ? null : current;
    });
  }, []);

  return (
    <Layout style={{ minHeight: '100vh', background: '#1a1a1a' }}>
      {contextHolder}
      <Header
        style={{
          background: '#141414',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <span style={{ fontSize: 24, marginRight: 12 }}>🎬</span>
        <Title level={4} style={{ margin: 0, color: '#e5a00d', letterSpacing: 1 }}>
          UNWATCHED
        </Title>
        <span style={{ marginLeft: 12, color: '#888', fontSize: 13 }}>
          Plex Discovery
        </span>

        <Space style={{ marginLeft: 'auto' }} size={8}>
          <Tooltip title="View on GitHub">
            <Button
              type="text"
              icon={<GithubOutlined style={{ fontSize: 18 }} />}
              href="https://github.com/orgs/NRCOM/Unwatched"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#aaa' }}
            />
          </Tooltip>
          <Tooltip title="Support on Patreon">
            <Button
              size="small"
              href="https://patreon.com/NRCOM"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#FF424D',
                borderColor: '#FF424D',
                color: '#fff',
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              Support on Patreon
            </Button>
          </Tooltip>
        </Space>
      </Header>

      <Layout style={{ background: '#1a1a1a' }}>
        <Sider
          width={300}
          collapsedWidth={0}
          collapsed={siderCollapsed}
          trigger={null}
          style={{
            background: '#141414',
            borderRight: siderCollapsed ? 'none' : '1px solid #2a2a2a',
            overflowY: 'auto',
            height: 'calc(100vh - 64px)',
            position: 'sticky',
            top: 64,
            transition: 'width 0.2s',
          }}
        >
          <SearchPanel
            users={users}
            genres={genres}
            onSearch={handleSearch}
            searching={searching}
          />
        </Sider>

        {/* Collapse toggle bump */}
        <div
          onClick={() => setSiderCollapsed((c) => !c)}
          style={{
            position: 'sticky',
            top: 64,
            alignSelf: 'flex-start',
            height: 'calc(100vh - 64px)',
            width: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#e5a00d',
            borderRight: '1px solid #c48a00',
            cursor: 'pointer',
            flexShrink: 0,
            zIndex: 10,
            opacity: 0.6,
          }}
        >
          {siderCollapsed
            ? <RightOutlined style={{ fontSize: 10, color: '#1a1a1a' }} />
            : <LeftOutlined style={{ fontSize: 10, color: '#1a1a1a' }} />}
        </div>

        <Content style={{ padding: '24px', overflowY: 'auto' }}>
          <ResultsTable
            data={results}
            loading={searching}
            searched={searched}
            onRowClick={setDrawerItem}
            siderCollapsed={siderCollapsed}
            includeWatchCount={includeWatchCount}
            onItemsDeleted={handleItemsDeleted}
          />
        </Content>
      </Layout>

      <MediaDrawer
        item={drawerItem}
        onClose={() => setDrawerItem(null)}
      />
    </Layout>
  );
}
