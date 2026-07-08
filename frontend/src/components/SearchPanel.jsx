import { useState, useEffect } from 'react';
import {
  Form,
  Select,
  Slider,
  Button,
  Checkbox,
  DatePicker,
  Divider,
  Space,
  Typography,
  InputNumber,
} from 'antd';
import { SearchOutlined, ClearOutlined, VideoCameraOutlined, DesktopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;

const RATING_PROVIDERS = [
  { value: 'tmdb', label: 'TMDB' },
  { value: 'imdb', label: 'IMDb' },
  { value: 'rottenTomatoes', label: 'Rotten Tomatoes' },
  { value: 'metacritic', label: 'Metacritic' },
  { value: 'tvdb', label: 'TVDB (Shows)' },
];

const SHOW_STATUSES = [
  { value: 'continuing', label: 'Continuing' },
  { value: 'ended', label: 'Ended' },
];

const WATCHED_MODES = [
  { value: 'unwatched', label: 'Unwatched by all selected users' },
  { value: 'watched', label: 'Watched by at least one selected user' },
  { value: 'any', label: 'Any watch status' },
];

const STORAGE_KEY = 'unwatched:searchParams';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savedToFormValues(saved) {
  if (!saved?.formValues) return {};
  return {
    ...saved.formValues,
    // yearRange stored as [number, number]; restore as dayjs objects
    yearRange: saved.formValues.yearRange
      ? [dayjs().year(saved.formValues.yearRange[0]), dayjs().year(saved.formValues.yearRange[1])]
      : undefined,
  };
}

export default function SearchPanel({ users, genres, onSearch, searching }) {
  const [form] = Form.useForm();
  const saved = loadSaved();
  const [includeMovies, setIncludeMovies] = useState(saved?.includeMovies ?? true);
  const [includeShows, setIncludeShows] = useState(saved?.includeShows ?? true);

  // Restore saved form values once on mount
  useEffect(() => {
    const s = loadSaved();
    if (s) form.setFieldsValue(savedToFormValues(s));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (values) => {
    const yearRange = values.yearRange
      ? [values.yearRange[0].year(), values.yearRange[1].year()]
      : null;

    // Persist to localStorage (yearRange stored as plain integers)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ includeMovies, includeShows, formValues: { ...values, yearRange } })
    );

    onSearch({
      userIds: values.userIds ?? [],
      includeMovies,
      includeShows,
      watchedMode: values.watchedMode ?? 'unwatched',
      genres: values.genres ?? [],
      diskPaths: values.diskPaths ?? [],
      yearRange,
      minRating: values.minRating ?? 0,
      ratingProvider: values.ratingProvider ?? 'tmdb',
      contentRatings: values.contentRatings ?? [],
      minRuntime: values.minRuntime ?? null,
      maxRuntime: values.maxRuntime ?? null,
      showStatus: values.showStatus ?? [],
      includeWatchCount: values.includeWatchCount ?? false,
    });
  };

  const handleReset = () => {
    form.resetFields();
    setIncludeMovies(true);
    setIncludeShows(true);
    localStorage.removeItem(STORAGE_KEY);
  };

  const allGenres = [
    ...(includeMovies && !includeShows
      ? genres.movies
      : !includeMovies && includeShows
      ? genres.shows
      : genres.all),
  ];

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      <Text
        strong
        style={{ display: 'block', marginBottom: 8, color: '#e5a00d', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}
      >
        Search Library
      </Text>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          ratingProvider: 'tmdb',
          minRating: 0,
          watchedMode: 'unwatched',
          includeWatchCount: false,
        }}
        size="small"
      >
        {/* Users */}
        <Form.Item label={<span style={{ color: '#aaa' }}>Plex Users</span>} name="userIds">
          <Select
            mode="multiple"
            allowClear
            placeholder="All users (no filter)"
            optionFilterProp="label"
            options={users.map((u) => ({
              value: u.userId,
              label: u.friendlyName,
            }))}
          />
        </Form.Item>

        {/* Media type toggles */}
        <Form.Item label={<span style={{ color: '#aaa' }}>Media Types</span>}>
          <Space.Compact
            block
            style={{ display: 'flex', width: '100%' }}
          >
            <Button
              type={includeMovies ? 'primary' : 'default'}
              icon={<VideoCameraOutlined />}
              onClick={() => setIncludeMovies((value) => !value)}
              aria-pressed={includeMovies}
              style={{ flex: 1, fontWeight: 600 }}
            >
              Movies
            </Button>
            <Button
              type={includeShows ? 'primary' : 'default'}
              icon={<DesktopOutlined />}
              onClick={() => setIncludeShows((value) => !value)}
              aria-pressed={includeShows}
              style={{ flex: 1, fontWeight: 600 }}
            >
              Shows
            </Button>
          </Space.Compact>
        </Form.Item>

        <Divider style={{ borderColor: '#2a2a2a', margin: '8px 0' }} />

        <Form.Item label={<span style={{ color: '#aaa' }}>Watch Status</span>} name="watchedMode">
          <Select options={WATCHED_MODES} />
        </Form.Item>

        {/* Genres */}
        <Form.Item label={<span style={{ color: '#aaa' }}>Genre</span>} name="genres">
          <Select
            mode="multiple"
            allowClear
            placeholder="All genres"
            optionFilterProp="label"
            options={allGenres.map((g) => ({ value: g, label: g }))}
          />
        </Form.Item>

        <Form.Item label={<span style={{ color: '#aaa' }}>Disk / Path</span>} name="diskPaths">
          <Select
            mode="multiple"
            allowClear
            placeholder="All disks / mount points"
            optionFilterProp="label"
            options={(genres.diskPaths ?? []).map((pathValue) => ({
              value: pathValue,
              label: pathValue,
            }))}
          />
        </Form.Item>

        {/* Release Year Range */}
        <Form.Item
          label={<span style={{ color: '#aaa' }}>Release Year Range</span>}
          name="yearRange"
        >
          <DatePicker.RangePicker
            picker="year"
            style={{ width: '100%' }}
            allowEmpty={[true, true]}
            placeholder={['From year', 'To year']}
          />
        </Form.Item>

        {/* Minimum Rating */}
        <Form.Item label={<span style={{ color: '#aaa' }}>Rating Provider</span>} name="ratingProvider">
          <Select options={RATING_PROVIDERS} />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ color: '#aaa' }}>
              Minimum Rating (0–10)
            </span>
          }
          name="minRating"
        >
          <Slider
            min={0}
            max={10}
            step={0.5}
            marks={{ 0: '0', 5: '5', 10: '10' }}
            tooltip={{ formatter: (v) => v }}
            style={{ marginBottom: -2 }}
          />
        </Form.Item>

        <Divider style={{ borderColor: '#2a2a2a', margin: '8px 0' }} />

        {/* Content Rating */}
        <Form.Item
          label={<span style={{ color: '#aaa' }}>Content Rating</span>}
          name="contentRatings"
        >
          <Select
            mode="multiple"
            allowClear
            placeholder="All ratings"
            options={(genres.contentRatings ?? []).map((r) => ({ value: r, label: r }))}
          />
        </Form.Item>

        {/* Runtime */}
        <Form.Item label={<span style={{ color: '#aaa' }}>Runtime (minutes)</span>}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="minRuntime" noStyle>
              <InputNumber placeholder="Min" min={0} style={{ width: '50%' }} />
            </Form.Item>
            <Form.Item name="maxRuntime" noStyle>
              <InputNumber placeholder="Max" min={0} style={{ width: '50%' }} />
            </Form.Item>
          </Space.Compact>
        </Form.Item>

        {/* Show Status (only relevant when shows included) */}
        {includeShows && (
          <Form.Item
            label={<span style={{ color: '#aaa' }}>Show Status</span>}
            name="showStatus"
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Any status"
              options={SHOW_STATUSES}
            />
          </Form.Item>
        )}

        <Form.Item name="includeWatchCount" valuePropName="checked" style={{ marginBottom: 8 }}>
          <Checkbox style={{ color: '#aaa' }}>Include watch count column</Checkbox>
        </Form.Item>

        <Divider style={{ borderColor: '#2a2a2a', margin: '12px 0' }} />

        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button
            icon={<ClearOutlined />}
            onClick={handleReset}
            size="small"
          >
            Reset
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SearchOutlined />}
            loading={searching}
            style={{ flex: 1, marginLeft: 8 }}
          >
            Search
          </Button>
        </Space>
      </Form>
    </div>
  );
}
