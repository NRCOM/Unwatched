import { useMemo, useState } from 'react';
import { Table, Tag, Space, Typography, Empty, Badge, Input, Select, Button, Modal, message, Checkbox } from 'antd';
import { VideoCameraOutlined, DesktopOutlined, StarFilled, SearchOutlined, DeleteOutlined } from '@ant-design/icons';
import { genreTagColor } from '../utils/genres';
import { deleteOneMedia, deleteBulkMedia } from '../services/api';

const { Text } = Typography;

function genreFilters(data) {
  const genres = new Set();
  data.forEach((item) => (item.genres ?? []).forEach((g) => genres.add(g)));
  return [...genres].sort().map((g) => ({ text: g, value: g }));
}

function getRatingDisplay(item) {
  const r = item.ratings ?? {};
  if (item.type === 'movie') {
    return r.tmdb ?? r.imdb ?? r.rottenTomatoes ?? r.metacritic ?? null;
  }
  return r.tvdb ?? null;
}

export default function ResultsTable({
  data,
  loading,
  searched,
  onRowClick,
  siderCollapsed,
  includeWatchCount,
  onItemsDeleted,
}) {
  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [tableSearch, setTableSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [deleting, setDeleting] = useState(false);
  const [actionMode, setActionMode] = useState('delete');
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [addExclusion, setAddExclusion] = useState(true);

  const filtered = useMemo(() => {
    let d = data;
    if (typeFilter !== 'all') d = d.filter((i) => i.type === typeFilter);
    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      d = d.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.genres ?? []).some((g) => g.toLowerCase().includes(q)) ||
          (i.studio ?? i.network ?? '').toLowerCase().includes(q) ||
          (i.rootFolderPath ?? '').toLowerCase().includes(q)
      );
    }
    return d;
  }, [data, typeFilter, tableSearch]);

  const selectedItems = data.filter((item) => selectedRowKeys.includes(`${item.type}-${item.id}`));

  const actionLabel = actionMode === 'delete' ? 'Delete' : 'Unmonitor';
  const actionLabelPast = actionMode === 'delete' ? 'Deleted' : 'Unmonitored';
  const actionLabelLower = actionMode === 'delete' ? 'delete' : 'unmonitor';

  function buildActionSummary() {
    if (actionMode === 'unmonitor') {
      return 'This will keep the media in Radarr/Sonarr but set monitored to off so it is not fetched again.';
    }

    if (deleteFiles && addExclusion) {
      return 'This will remove media files from disk and add an import exclusion to reduce re-fetches.';
    }

    if (deleteFiles) {
      return 'This will remove media files from disk via Sonarr/Radarr.';
    }

    return 'This will remove the media entry from Sonarr/Radarr while keeping files on disk.';
  }

  async function handleDeleteOne(record) {
    setDeleting(true);
    try {
      await deleteOneMedia({
        type: record.type,
        id: record.id,
        action: actionMode,
        deleteFiles,
        addExclusion,
      });
      messageApi.success(`${actionLabelPast} ${record.title}`);
      setSelectedRowKeys((keys) => keys.filter((k) => k !== `${record.type}-${record.id}`));
      if (actionMode === 'delete') {
        onItemsDeleted?.([{ type: record.type, id: record.id }]);
      }
    } catch (err) {
      messageApi.error(`Failed to ${actionLabelLower} ${record.title}: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  }

  function confirmDeleteOne(record) {
    modal.confirm({
      centered: true,
      title: `${actionLabel} ${record.title}?`,
      content: buildActionSummary(),
      okText: actionMode === 'delete' ? 'Apply delete policy' : 'Unmonitor media',
      okButtonProps: { danger: actionMode === 'delete' },
      cancelText: 'Cancel',
      styles: {
        content: { background: '#1f1f1f' },
        header: { background: '#1f1f1f' },
        body: { color: '#d9d9d9' },
        footer: { background: '#1f1f1f' },
      },
      onOk: () => handleDeleteOne(record),
    });
  }

  function confirmBulkDelete() {
    if (selectedItems.length === 0) return;
    modal.confirm({
      centered: true,
      title: `${actionLabel} ${selectedItems.length} selected item${selectedItems.length !== 1 ? 's' : ''}?`,
      content: `${buildActionSummary()} Failed operations will be reported.`,
      okText: actionMode === 'delete' ? 'Apply delete policy' : 'Unmonitor selected',
      okButtonProps: { danger: actionMode === 'delete' },
      cancelText: 'Cancel',
      styles: {
        content: { background: '#1f1f1f' },
        header: { background: '#1f1f1f' },
        body: { color: '#d9d9d9' },
        footer: { background: '#1f1f1f' },
      },
      onOk: async () => {
        setDeleting(true);
        try {
          const response = await deleteBulkMedia({
            items: selectedItems.map((item) => ({ type: item.type, id: item.id })),
            action: actionMode,
            deleteFiles,
            addExclusion,
            concurrency: 3,
          });

          const deletedItems = response.deleted ?? [];
          const failedItems = response.failed ?? [];

          if (deletedItems.length > 0 && actionMode === 'delete') {
            onItemsDeleted?.(deletedItems.map((item) => ({ type: item.type, id: item.id })));
          }

          if (failedItems.length > 0) {
            messageApi.warning(
              `${actionLabelPast} ${deletedItems.length} item${deletedItems.length !== 1 ? 's' : ''}, ${failedItems.length} failed`
            );
          } else {
            messageApi.success(`${actionLabelPast} ${deletedItems.length} item${deletedItems.length !== 1 ? 's' : ''}`);
          }

          setSelectedRowKeys([]);
        } catch (err) {
          messageApi.error(`Bulk ${actionLabelLower} failed: ${err.message}`);
        } finally {
          setDeleting(false);
        }
      },
    });
  }

  // When sidebar is open use fixed widths; when collapsed let columns distribute evenly.
  const w = siderCollapsed
    ? { poster: 48, title: undefined, type: undefined, popularity: undefined, year: undefined, genres: undefined, rating: undefined, runtime: undefined, studio: undefined, added: undefined }
    : { poster: 48, title: 180, type: 80, popularity: 90, year: 70, genres: 180, rating: 80, runtime: 120, studio: 120, added: 95 };

  const columns = [
    {
      title: '',
      key: 'poster',
      width: w.poster,
      render: (_, record) => (
        <img
          src={record.posterPath}
          alt={record.title}
          loading="lazy"
          style={{
            width: 36,
            height: 54,
            objectFit: 'cover',
            borderRadius: 3,
            background: '#2a2a2a',
          }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: w.title,
      sorter: (a, b) => a.title.localeCompare(b.title),
      defaultSortOrder: 'ascend',
      render: (title, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{title}</Text>
          {record.collection && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.collection}
            </Text>
          )}
        </Space>
      ),
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }}>
          <Input
            placeholder="Search title"
            value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={confirm}
            style={{ display: 'block', marginBottom: 8 }}
          />
          <Space>
            <a onClick={confirm}>Filter</a>
            <a onClick={clearFilters}>Reset</a>
          </Space>
        </div>
      ),
      filterIcon: (filtered) => (
        <SearchOutlined style={{ color: filtered ? '#e5a00d' : undefined }} />
      ),
      onFilter: (value, record) =>
        record.title.toLowerCase().includes(value.toLowerCase()),
    },
    {
      title: 'Type',
      key: 'type',
      width: w.type,
      filters: [
        { text: 'Movie', value: 'movie' },
        { text: 'Show', value: 'show' },
      ],
      onFilter: (value, record) => record.type === value,
      render: (_, record) =>
        record.type === 'movie' ? (
          <Tag color="blue" icon={<VideoCameraOutlined />}>
            Movie
          </Tag>
        ) : (
          <Tag color="purple" icon={<DesktopOutlined />}>
            Show
          </Tag>
        ),
    },
    {
      title: 'Popularity',
      dataIndex: 'popularity',
      key: 'popularity',
      width: w.popularity,
      sorter: (a, b) => (a.popularity ?? 0) - (b.popularity ?? 0),
      render: (val) =>
        val != null ? (
          <Text>{Number(val).toFixed(1)}</Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      width: w.year,
      sorter: (a, b) => (a.year ?? 0) - (b.year ?? 0),
    },
    {
      title: 'Genres',
      dataIndex: 'genres',
      key: 'genres',
      width: w.genres,
      filters: genreFilters(data),
      onFilter: (value, record) => (record.genres ?? []).includes(value),
      filterSearch: true,
      render: (genres) => (
        <Space size={2} wrap>
          {(genres ?? []).slice(0, 3).map((g) => (
            <Tag key={g} color={genreTagColor(g)} style={{ fontSize: 11, margin: 0 }}>
              {g}
            </Tag>
          ))}
          {(genres ?? []).length > 3 && (
            <Tag style={{ fontSize: 11, margin: 0 }}>+{genres.length - 3}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Rating',
      key: 'rating',
      width: w.rating,
      sorter: (a, b) => (getRatingDisplay(a) ?? 0) - (getRatingDisplay(b) ?? 0),
      render: (_, record) => {
        const r = getRatingDisplay(record);
        if (r == null) return <Text type="secondary">—</Text>;
        return (
          <Space size={4}>
            <StarFilled style={{ color: '#e5a00d', fontSize: 12 }} />
            <Text>{Number(r).toFixed(1)}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Runtime / Seasons',
      key: 'runtime',
      width: w.runtime,
      sorter: (a, b) => (a.runtime ?? 0) - (b.runtime ?? 0),
      render: (_, record) => {
        if (record.type === 'movie') {
          const rt = record.runtime;
          if (!rt) return <Text type="secondary">—</Text>;
          const h = Math.floor(rt / 60);
          const m = rt % 60;
          return <Text>{h > 0 ? `${h}h ${m}m` : `${m}m`}</Text>;
        }
        const seasons = record.seasonCount;
        const status = record.status;
        return (
          <Space direction="vertical" size={0}>
            <Text>{seasons} season{seasons !== 1 ? 's' : ''}</Text>
            {status && (
              <Badge
                status={status === 'continuing' ? 'processing' : 'default'}
                text={<Text style={{ fontSize: 11, color: '#888' }}>{status}</Text>}
              />
            )}
          </Space>
        );
      },
    },
    {
      title: 'Studio / Network',
      key: 'studio',
      width: w.studio,
      sorter: (a, b) =>
        (a.studio ?? a.network ?? '').localeCompare(b.studio ?? b.network ?? ''),
      render: (_, record) => (
        <Text type="secondary">{record.studio ?? record.network ?? '—'}</Text>
      ),
    },
    ...(includeWatchCount
      ? [
          {
            title: 'Watch Count',
            dataIndex: 'watchCount',
            key: 'watchCount',
            width: 110,
            sorter: (a, b) => (a.watchCount ?? 0) - (b.watchCount ?? 0),
            render: (val) => <Text>{val ?? 0}</Text>,
          },
        ]
      : []),
    {
      title: 'Added',
      dataIndex: 'added',
      key: 'added',
      width: w.added,
      sorter: (a, b) => new Date(a.added ?? 0) - new Date(b.added ?? 0),
      render: (val) =>
        val ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(val).toLocaleDateString()}
          </Text>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Button
          type="text"
          danger={actionMode === 'delete'}
          size="small"
          icon={<DeleteOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            confirmDeleteOne(record);
          }}
        >
          {actionLabel}
        </Button>
      ),
    },
  ];

  return (
    <div>
      {modalContextHolder}
      {messageContextHolder}
      {/* Table-level quick filters */}
      <Space style={{ marginBottom: 16, flexWrap: 'wrap' }} size={8}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Filter results…"
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
          allowClear
          style={{ width: 240 }}
          size="small"
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          size="small"
          style={{ width: 120 }}
          options={[
            { value: 'all', label: 'All types' },
            { value: 'movie', label: 'Movies only' },
            { value: 'show', label: 'Shows only' },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 13 }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {data.length !== filtered.length ? ` (filtered from ${data.length})` : ''}
        </Text>
        <Select
          value={actionMode}
          onChange={setActionMode}
          size="small"
          style={{ width: 130 }}
          options={[
            { value: 'delete', label: 'Delete' },
            { value: 'unmonitor', label: 'Unmonitor' },
          ]}
        />
        <Checkbox
          checked={deleteFiles}
          disabled={actionMode !== 'delete'}
          onChange={(e) => setDeleteFiles(e.target.checked)}
          style={{ color: '#aaa' }}
        >
          Delete files
        </Checkbox>
        <Checkbox
          checked={addExclusion}
          disabled={actionMode !== 'delete'}
          onChange={(e) => setAddExclusion(e.target.checked)}
          style={{ color: '#aaa' }}
        >
          Add exclusion
        </Checkbox>
        <Button
          danger={actionMode === 'delete'}
          icon={<DeleteOutlined />}
          size="small"
          disabled={selectedItems.length === 0 || deleting}
          loading={deleting}
          onClick={confirmBulkDelete}
        >
          {actionLabel} Selected ({selectedItems.length})
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={filtered}
        loading={loading}
        rowKey={(r) => `${r.type}-${r.id}`}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          preserveSelectedRowKeys: true,
        }}
        size="small"
        locale={{
          emptyText: searched ? (
            <Empty
              description="No media matched your filters"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Empty
              description="Use the panel on the left to search your media library"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        onRow={(record) => ({
          onClick: () => onRowClick(record),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          defaultPageSize: 50,
          pageSizeOptions: [25, 50, 100, 200],
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
        }}
        scroll={siderCollapsed ? { x: 'max-content' } : undefined}
      />
    </div>
  );
}
