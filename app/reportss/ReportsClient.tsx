'use client';

import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BadgeDollarSign,
  Boxes,
  Building2,
  Calendar,
  ChartColumn,
  CircleAlert,
  Clock3,
  CreditCard,
  Download,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Package,
  Printer,
  Receipt,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import {
  loadReportsAnalytics,
  type ReportColumn,
  type ReportGroup,
  type ReportPreset,
  type ReportsAnalyticsData,
  type ReportSchedule,
  type ReportScheduleRun,
  type ReportTable,
} from '@/lib/reports';

const CURRENCY = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
});
const NUMBER = new Intl.NumberFormat('en-PH');
const PERCENT = new Intl.NumberFormat('en-PH', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const PIE_COLORS = ['#2563eb', '#0f766e', '#f59e0b', '#7c3aed', '#dc2626', '#1d4ed8'];

const GROUP_META: Record<
  ReportGroup,
  {
    title: string;
    eyebrow: string;
    description: string;
    icon: typeof TrendingUp;
  }
> = {
  sales: {
    title: 'Sales Reports',
    eyebrow: 'Module 14',
    description: 'Daily, monthly, cashier, branch, category, brand, product, payment, discount, and refund reporting.',
    icon: TrendingUp,
  },
  inventory: {
    title: 'Inventory Reports',
    eyebrow: 'Module 14',
    description: 'Stock position, valuation, movement, adjustments, and velocity monitoring from one workspace.',
    icon: Package,
  },
  financial: {
    title: 'Financial Reports',
    eyebrow: 'Module 14',
    description: 'Gross sales, net sales, profit, expenses, receivables, payables, and cash drawer accountability.',
    icon: BadgeDollarSign,
  },
};

function formatCurrency(value: number) {
  return CURRENCY.format(value).replace('PHP', 'P');
}

function formatCell(column: ReportColumn, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '-';
  if (column.type === 'currency') return formatCurrency(Number(value));
  if (column.type === 'number') return NUMBER.format(Number(value));
  if (column.type === 'percent') return PERCENT.format(Number(value));
  if (column.type === 'date') {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(String(value)));
  }
  if (column.type === 'datetime') {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(String(value)));
  }
  return String(value);
}

function rowsToMatrix(report: ReportTable, rows: Record<string, string | number | null>[]) {
  return rows.map((row) => report.columns.map((column) => formatCell(column, row[column.key])));
}

function exportRowsAsCsv(report: ReportTable, rows: Record<string, string | number | null>[]) {
  const headers = report.columns.map((column) => column.label);
  const body = rowsToMatrix(report, rows).map((line) =>
    line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`),
  );
  const csv = [headers.join(','), ...body.map((line) => line.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${report.id}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportRowsAsXlsx(report: ReportTable, rows: Record<string, string | number | null>[]) {
  const matrix = [report.columns.map((column) => column.label), ...rowsToMatrix(report, rows)];
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  XLSX.writeFile(workbook, `${report.id}.xlsx`);
}

function exportRowsAsPdf(report: ReportTable, rows: Record<string, string | number | null>[]) {
  const doc = new jsPDF({
    orientation: report.columns.length > 7 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  doc.setFontSize(16);
  doc.text(report.title, 40, 40);
  doc.setFontSize(10);
  doc.text(report.description, 40, 58);

  autoTable(doc, {
    startY: 76,
    head: [report.columns.map((column) => column.label)],
    body: rowsToMatrix(report, rows),
    styles: {
      fontSize: 8,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [37, 99, 235],
    },
    margin: { left: 24, right: 24 },
  });

  doc.save(`${report.id}.pdf`);
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="ra14-empty">{message}</div>;
}

function BreakdownCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof TrendingUp;
  children: React.ReactNode;
}) {
  return (
    <section className="ra14-panel">
      <div className="ra14-panel__head">
        <div className="ra14-panel__title-wrap">
          <span className="ra14-panel__icon"><Icon size={15} /></span>
          <span className="ra14-panel__title">{title}</span>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function ReportsClient() {
  const [loading, setLoading] = useState(true);
  const [metaLoading, setMetaLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<ReportsAnalyticsData | null>(null);
  const [presets, setPresets] = useState<ReportPreset[]>([]);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [runs, setRuns] = useState<ReportScheduleRun[]>([]);
  const [branchId, setBranchId] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    return window.localStorage.getItem('active_branch_id') || 'all';
  });
  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeGroup, setActiveGroup] = useState<ReportGroup>('sales');
  const [activeReportId, setActiveReportId] = useState('daily-sales');
  const [search, setSearch] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');
  const [schedulePresetId, setSchedulePresetId] = useState('');
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState('1');
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState('1');
  const [scheduleRunTime, setScheduleRunTime] = useState('08:00');
  const [scheduleFormat, setScheduleFormat] = useState<'pdf' | 'xlsx' | 'csv'>('pdf');
  const [scheduleDelivery, setScheduleDelivery] = useState<'download_center' | 'email'>('download_center');
  const [scheduleRecipients, setScheduleRecipients] = useState('');

  async function getAuthHeaders() {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult.data.session?.access_token;
    if (!token) throw new Error('Please sign in again to manage report presets and schedules.');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  async function loadAnalytics() {
    setLoading(true);
    setError('');
    try {
      const next = await loadReportsAnalytics({ branchId, dateFrom, dateTo });
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }

  async function loadMeta() {
    setMetaLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/reports', { headers });
      const payload = (await response.json()) as {
        error?: string;
        presets?: ReportPreset[];
        schedules?: ReportSchedule[];
        runs?: ReportScheduleRun[];
      };
      if (!response.ok) throw new Error(payload.error || 'Unable to load report presets.');
      setPresets(payload.presets ?? []);
      setSchedules(payload.schedules ?? []);
      setRuns(payload.runs ?? []);
      setSchedulePresetId((current) => current || payload.presets?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load report metadata.');
    } finally {
      setMetaLoading(false);
    }
  }

  async function postReportsAction(body: unknown) {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/reports', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string; message?: string };
    if (!response.ok) throw new Error(payload.error || 'Report action failed.');
    if (payload.message) setNotice(payload.message);
    await loadMeta();
  }

  async function saveCurrentPreset() {
    if (!activeReport) return;
    setSaving(true);
    try {
      await postReportsAction({
        action: 'create_preset',
        preset: {
          name: presetName.trim() || activeReport.title,
          description: presetDescription.trim() || null,
          groupKey: activeGroup,
          reportId: activeReport.id,
          branchId: branchId === 'all' ? null : branchId,
          dateFrom,
          dateTo,
          searchTerm: search.trim() || null,
          filters: {},
          isShared: false,
        },
      });
      setPresetName('');
      setPresetDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save preset.');
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(preset: ReportPreset) {
    const nextGroup = (preset.group_key as ReportGroup) || 'sales';
    setActiveGroup(nextGroup);
    setActiveReportId(preset.report_id);
    setBranchId(preset.branch_id || 'all');
    if (preset.date_from) setDateFrom(preset.date_from);
    if (preset.date_to) setDateTo(preset.date_to);
    setSearch(preset.search_term || '');
    setNotice(`Loaded preset: ${preset.name}`);
  }

  async function createSchedule() {
    if (!schedulePresetId) {
      setError('Choose a preset before creating a schedule.');
      return;
    }
    setSaving(true);
    try {
      await postReportsAction({
        action: 'create_schedule',
        schedule: {
          presetId: schedulePresetId,
          name: scheduleName.trim() || 'Scheduled report',
          branchId: branchId === 'all' ? null : branchId,
          frequency: scheduleFrequency,
          dayOfWeek: scheduleFrequency === 'weekly' ? Number(scheduleDayOfWeek) : null,
          dayOfMonth: scheduleFrequency === 'monthly' ? Number(scheduleDayOfMonth) : null,
          runTime: scheduleRunTime,
          exportFormat: scheduleFormat,
          deliveryChannel: scheduleDelivery,
          recipients: scheduleRecipients
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          isActive: true,
        },
      });
      setScheduleName('');
      setScheduleRecipients('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function runSchedule(scheduleId: string) {
    setSaving(true);
    try {
      await postReportsAction({ action: 'run_schedule', scheduleId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function runDueSchedules() {
    setSaving(true);
    try {
      await postReportsAction({ action: 'run_due_schedules' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to run due schedules.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAnalytics();
    }, 0);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, dateFrom, dateTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMeta();
    }, 0);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const branch = (event as CustomEvent<{ id?: string }>).detail;
      if (branch?.id) setBranchId(branch.id);
    };
    window.addEventListener('branch-changed', handler);
    return () => window.removeEventListener('branch-changed', handler);
  }, []);

  const reports = data?.reports ?? [];
  const groupReports = reports.filter((report) => report.group === activeGroup);
  const activeReport =
    groupReports.find((report) => report.id === activeReportId) ??
    groupReports[0] ??
    reports[0] ??
    null;

  const filteredRows = activeReport
    ? activeReport.rows.filter((row) =>
        !search.trim() ||
        activeReport.columns.some((column) =>
          String(row[column.key] ?? '')
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        ),
      )
    : [];

  const meta = GROUP_META[activeGroup];
  const MetaIcon = meta.icon;
  const branchName =
    branchId === 'all'
      ? 'All Branches'
      : data?.branches.find((branch) => branch.id === branchId)?.name ?? 'Selected Branch';

  const paymentBreakdown = data?.breakdowns.payment ?? [];
  const categoryBreakdown = data?.breakdowns.category ?? [];
  const inventoryHealth = data?.breakdowns.inventoryHealth ?? [];
  const dailyTrend = data?.trends.daily ?? [];
  const monthlyTrend = data?.trends.monthly ?? [];

  const tooltipMoney = (value: unknown) => formatCurrency(Number(value ?? 0));

  return (
    <div className="ra14-page">
      <section className="ra14-hero">
        <div className="ra14-hero__copy">
          <span className="ra14-hero__eyebrow">{meta.eyebrow}</span>
          <div className="ra14-hero__headline">
            <span className="ra14-hero__badge"><MetaIcon size={16} /></span>
            <div>
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
            </div>
          </div>
        </div>
        <div className="ra14-hero__summary">
          <span>{branchName}</span>
          <span>{dateFrom} to {dateTo}</span>
          <span>{activeReport?.title ?? 'No report selected'}</span>
        </div>
      </section>

      <section className="ra14-toolbar">
        <div className="ra14-toolbar__filters">
          <label className="ra14-input ra14-input--date">
            <Calendar size={14} />
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
          <label className="ra14-input ra14-input--date">
            <Calendar size={14} />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <label className="ra14-input">
            <Building2 size={14} />
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="all">All Branches</option>
              {(data?.branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="ra14-input">
            <Filter size={14} />
            <select value={activeGroup} onChange={(event) => setActiveGroup(event.target.value as ReportGroup)}>
              <option value="sales">Sales Reports</option>
              <option value="inventory">Inventory Reports</option>
              <option value="financial">Financial Reports</option>
            </select>
          </label>
        </div>
        <div className="ra14-toolbar__actions">
          <button type="button" className="ra14-button ra14-button--ghost" onClick={() => activeReport && exportRowsAsCsv(activeReport, filteredRows)} disabled={!activeReport}>
            <Download size={14} />
            CSV
          </button>
          <button type="button" className="ra14-button ra14-button--ghost" onClick={() => activeReport && exportRowsAsXlsx(activeReport, filteredRows)} disabled={!activeReport}>
            <FileSpreadsheet size={14} />
            Excel
          </button>
          <button type="button" className="ra14-button ra14-button--ghost" onClick={() => activeReport && exportRowsAsPdf(activeReport, filteredRows)} disabled={!activeReport}>
            <Receipt size={14} />
            PDF
          </button>
          <button type="button" className="ra14-button ra14-button--ghost" onClick={() => window.print()}>
            <Printer size={14} />
            Print
          </button>
          <button type="button" className="ra14-button ra14-button--primary" onClick={() => void loadAnalytics()} disabled={loading}>
            {loading ? <LoaderCircle size={14} className="ra14-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </section>

      {error ? (
        <div className="ra14-alert ra14-alert--error">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {notice ? (
        <div className="ra14-alert ra14-alert--success">
          <Send size={16} />
          <span>{notice}</span>
        </div>
      ) : null}

      <section className="ra14-metrics">
        {(data?.metrics ?? []).map((metric) => (
          <article key={metric.id} className={`ra14-metric ra14-metric--${metric.tone}`}>
            <div className="ra14-metric__icon">
              {metric.id.includes('inventory') ? <Boxes size={18} /> : null}
              {metric.id.includes('receivables') ? <BadgeDollarSign size={18} /> : null}
              {metric.id.includes('payables') ? <Receipt size={18} /> : null}
              {metric.id.includes('cash') ? <Wallet size={18} /> : null}
              {metric.id === 'gross-sales' || metric.id === 'net-sales' ? <TrendingUp size={18} /> : null}
              {metric.id === 'gross-profit' ? <ChartColumn size={18} /> : null}
              {metric.id === 'expenses' ? <CreditCard size={18} /> : null}
            </div>
            <div className="ra14-metric__body">
              <span className="ra14-metric__label">{metric.label}</span>
              <strong className="ra14-metric__value">{formatCurrency(metric.value)}</strong>
              <small className="ra14-metric__hint">{metric.hint}</small>
            </div>
          </article>
        ))}
      </section>

      <section className="ra14-layout">
        <aside className="ra14-sidebar">
          <div className="ra14-panel">
            <div className="ra14-panel__head">
              <div className="ra14-panel__title-wrap">
                <span className="ra14-panel__icon"><Download size={15} /></span>
                <span className="ra14-panel__title">Report Catalog</span>
              </div>
            </div>
            <div className="ra14-catalog-groups">
              {(['sales', 'inventory', 'financial'] as ReportGroup[]).map((group) => {
                const groupMeta = GROUP_META[group];
                const Icon = groupMeta.icon;
                const count = reports.filter((report) => report.group === group).length;
                return (
                  <button
                    type="button"
                    key={group}
                    className={`ra14-catalog-group ${activeGroup === group ? 'ra14-catalog-group--active' : ''}`}
                    onClick={() => setActiveGroup(group)}
                  >
                    <span className="ra14-catalog-group__icon"><Icon size={15} /></span>
                    <span className="ra14-catalog-group__copy">
                      <strong>{groupMeta.title}</strong>
                      <small>{count} reports</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="ra14-report-list">
              {groupReports.map((report) => (
                <button
                  type="button"
                  key={report.id}
                  className={`ra14-report-link ${activeReportId === report.id ? 'ra14-report-link--active' : ''}`}
                  onClick={() => setActiveReportId(report.id)}
                >
                  <strong>{report.title}</strong>
                  <small>{report.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="ra14-panel">
            <div className="ra14-panel__head">
              <div className="ra14-panel__title-wrap">
                <span className="ra14-panel__icon"><Save size={15} /></span>
                <span className="ra14-panel__title">Custom Builder</span>
              </div>
            </div>
            <div className="ra14-form">
              <label className="ra14-field">
                <span>Preset name</span>
                <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Month-end branch P&L" />
              </label>
              <label className="ra14-field">
                <span>Description</span>
                <textarea value={presetDescription} onChange={(event) => setPresetDescription(event.target.value)} placeholder="Saved view of the current report filters." />
              </label>
              <button type="button" className="ra14-button ra14-button--primary" onClick={() => void saveCurrentPreset()} disabled={!activeReport || saving}>
                <Save size={14} />
                Save Current View
              </button>
            </div>
            <div className="ra14-mini-list">
              {metaLoading ? <EmptyPanel message="Loading presets..." /> : null}
              {!metaLoading && !presets.length ? <EmptyPanel message="No saved presets yet." /> : null}
              {!metaLoading && presets.map((preset) => (
                <div key={preset.id} className="ra14-mini-card">
                  <div className="ra14-mini-card__copy">
                    <strong>{preset.name}</strong>
                    <small>{preset.description || `${preset.group_key} / ${preset.report_id}`}</small>
                  </div>
                  <div className="ra14-mini-card__actions">
                    <button type="button" className="ra14-button ra14-button--ghost ra14-button--sm" onClick={() => applyPreset(preset)}>Load</button>
                    <button
                      type="button"
                      className="ra14-button ra14-button--ghost ra14-button--sm"
                      onClick={() => void postReportsAction({ action: 'delete_preset', presetId: preset.id }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to delete preset.'))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="ra14-main">
          <div className="ra14-chart-grid">
            <BreakdownCard title="Daily Sales Trend" icon={TrendingUp}>
              {dailyTrend.length ? (
                <div className="ra14-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailyTrend} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ra14Sales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="ra14Profit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0f766e" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e5edf7" strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(value) => `P${Math.round(Number(value) / 1000)}k`} />
                      <Tooltip formatter={(value: unknown) => tooltipMoney(value)} />
                      <Area type="monotone" dataKey="netSales" stroke="#2563eb" fill="url(#ra14Sales)" strokeWidth={2} />
                      <Area type="monotone" dataKey="grossProfit" stroke="#0f766e" fill="url(#ra14Profit)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel message="No trend data available for this range." />
              )}
            </BreakdownCard>

            <BreakdownCard title="Monthly Performance" icon={ChartColumn}>
              {monthlyTrend.length ? (
                <div className="ra14-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#e5edf7" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(value) => `P${Math.round(Number(value) / 1000)}k`} />
                      <Tooltip formatter={(value: unknown) => tooltipMoney(value)} />
                      <Bar dataKey="grossSales" fill="#bfdbfe" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="netSales" fill="#2563eb" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyPanel message="No monthly data available for this range." />
              )}
            </BreakdownCard>
          </div>

          <div className="ra14-chart-grid ra14-chart-grid--secondary">
            <BreakdownCard title="Payment Mix" icon={CreditCard}>
              {paymentBreakdown.length ? (
                <div className="ra14-breakdown">
                  <PieChart width={170} height={170}>
                    <Pie data={paymentBreakdown} dataKey="value" cx={80} cy={80} innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {paymentBreakdown.map((item, index) => (
                        <Cell key={item.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: unknown) => tooltipMoney(value)} />
                  </PieChart>
                  <div className="ra14-breakdown__legend">
                    {paymentBreakdown.map((item, index) => (
                      <div key={item.name} className="ra14-legend-row">
                        <span className="ra14-legend-row__dot" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                        <span className="ra14-legend-row__name">{item.name}</span>
                        <strong>{formatCurrency(item.value)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyPanel message="No payment breakdown available." />
              )}
            </BreakdownCard>

            <BreakdownCard title={activeGroup === 'inventory' ? 'Inventory Health' : 'Top Categories'} icon={activeGroup === 'inventory' ? Boxes : Package}>
              {activeGroup === 'inventory' ? (
                inventoryHealth.length ? (
                  <div className="ra14-bars">
                    {inventoryHealth.map((item, index) => {
                      const maxValue = Math.max(...inventoryHealth.map((entry) => entry.value), 1);
                      return (
                        <div key={item.name} className="ra14-bar-row">
                          <div className="ra14-bar-row__top">
                            <span>{item.name}</span>
                            <strong>{NUMBER.format(item.value)}</strong>
                          </div>
                          <div className="ra14-bar-row__track">
                            <div className="ra14-bar-row__fill" style={{ width: `${(item.value / maxValue) * 100}%`, background: PIE_COLORS[index % PIE_COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyPanel message="No stock data available." />
                )
              ) : categoryBreakdown.length ? (
                <div className="ra14-bars">
                  {categoryBreakdown.map((item, index) => {
                    const maxValue = Math.max(...categoryBreakdown.map((entry) => entry.value), 1);
                    return (
                      <div key={item.name} className="ra14-bar-row">
                        <div className="ra14-bar-row__top">
                          <span>{item.name}</span>
                          <strong>{formatCurrency(item.value)}</strong>
                        </div>
                        <div className="ra14-bar-row__track">
                          <div className="ra14-bar-row__fill" style={{ width: `${(item.value / maxValue) * 100}%`, background: PIE_COLORS[index % PIE_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyPanel message="No category data available." />
              )}
            </BreakdownCard>
          </div>

          <section className="ra14-panel ra14-panel--table">
            <div className="ra14-panel__head ra14-panel__head--table">
              <div>
                <div className="ra14-panel__title-wrap">
                  <span className="ra14-panel__icon"><FileSpreadsheet size={15} /></span>
                  <span className="ra14-panel__title">{activeReport?.title ?? 'Report'}</span>
                </div>
                <p className="ra14-panel__description">{activeReport?.description ?? 'Select a report to view details.'}</p>
              </div>
              <div className="ra14-panel__meta">
                <span>{activeReport?.scopeLabel}</span>
                <span>{NUMBER.format(filteredRows.length)} rows</span>
              </div>
            </div>

            <div className="ra14-table-toolbar">
              <label className="ra14-input ra14-input--search">
                <Search size={14} />
                <input type="search" placeholder="Search this report" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
            </div>

            {!activeReport ? (
              <EmptyPanel message="No report is available for the selected group." />
            ) : loading ? (
              <div className="ra14-loading">
                <LoaderCircle size={18} className="ra14-spin" />
                <span>Loading analytics workspace...</span>
              </div>
            ) : !filteredRows.length ? (
              <EmptyPanel message="No rows match the current report filters." />
            ) : (
              <div className="ra14-table-wrap">
                <table className="ra14-table">
                  <thead>
                    <tr>
                      {activeReport.columns.map((column) => (
                        <th key={column.key} className={column.align === 'right' ? 'ra14-ta-right' : ''}>{column.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, index) => (
                      <tr key={`${activeReport.id}-${index}`}>
                        {activeReport.columns.map((column) => (
                          <td key={column.key} className={column.align === 'right' ? 'ra14-ta-right' : ''}>
                            {formatCell(column, row[column.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ra14-bottom-grid">
            <div className="ra14-panel">
              <div className="ra14-panel__head">
                <div className="ra14-panel__title-wrap">
                  <span className="ra14-panel__icon"><Clock3 size={15} /></span>
                  <span className="ra14-panel__title">Scheduled Reports</span>
                </div>
                <button type="button" className="ra14-button ra14-button--ghost ra14-button--sm" onClick={() => void runDueSchedules()} disabled={saving}>
                  <RefreshCw size={13} />
                  Run Due
                </button>
              </div>
              <div className="ra14-form">
                <label className="ra14-field">
                  <span>Preset</span>
                  <select value={schedulePresetId} onChange={(event) => setSchedulePresetId(event.target.value)}>
                    <option value="">Choose preset</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                  </select>
                </label>
                <label className="ra14-field">
                  <span>Schedule name</span>
                  <input value={scheduleName} onChange={(event) => setScheduleName(event.target.value)} placeholder="Weekly cashier sales" />
                </label>
                <div className="ra14-form__row">
                  <label className="ra14-field">
                    <span>Frequency</span>
                    <select value={scheduleFrequency} onChange={(event) => setScheduleFrequency(event.target.value as 'daily' | 'weekly' | 'monthly')}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  <label className="ra14-field">
                    <span>Run time</span>
                    <input type="time" value={scheduleRunTime} onChange={(event) => setScheduleRunTime(event.target.value)} />
                  </label>
                </div>
                {scheduleFrequency === 'weekly' ? (
                  <label className="ra14-field">
                    <span>Day of week</span>
                    <select value={scheduleDayOfWeek} onChange={(event) => setScheduleDayOfWeek(event.target.value)}>
                      <option value="0">Sunday</option>
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                    </select>
                  </label>
                ) : null}
                {scheduleFrequency === 'monthly' ? (
                  <label className="ra14-field">
                    <span>Day of month</span>
                    <input type="number" min="1" max="31" value={scheduleDayOfMonth} onChange={(event) => setScheduleDayOfMonth(event.target.value)} />
                  </label>
                ) : null}
                <div className="ra14-form__row">
                  <label className="ra14-field">
                    <span>Format</span>
                    <select value={scheduleFormat} onChange={(event) => setScheduleFormat(event.target.value as 'pdf' | 'xlsx' | 'csv')}>
                      <option value="pdf">PDF</option>
                      <option value="xlsx">Excel</option>
                      <option value="csv">CSV</option>
                    </select>
                  </label>
                  <label className="ra14-field">
                    <span>Delivery</span>
                    <select value={scheduleDelivery} onChange={(event) => setScheduleDelivery(event.target.value as 'download_center' | 'email')}>
                      <option value="download_center">Download center</option>
                      <option value="email">Email queue</option>
                    </select>
                  </label>
                </div>
                <label className="ra14-field">
                  <span>Recipients</span>
                  <input value={scheduleRecipients} onChange={(event) => setScheduleRecipients(event.target.value)} placeholder="owner@example.com, branch@example.com" />
                </label>
                <button type="button" className="ra14-button ra14-button--primary" onClick={() => void createSchedule()} disabled={saving || !presets.length}>
                  <Clock3 size={14} />
                  Save Schedule
                </button>
              </div>
              <div className="ra14-mini-list">
                {metaLoading ? <EmptyPanel message="Loading schedules..." /> : null}
                {!metaLoading && !schedules.length ? <EmptyPanel message="No schedules created yet." /> : null}
                {!metaLoading && schedules.map((schedule) => (
                  <div key={schedule.id} className="ra14-mini-card">
                    <div className="ra14-mini-card__copy">
                      <strong>{schedule.name}</strong>
                      <small>{schedule.frequency} • {schedule.export_format.toUpperCase()} • next {schedule.next_run_at ? formatCell({ key: 'next', label: 'Next', type: 'datetime' }, schedule.next_run_at) : 'inactive'}</small>
                    </div>
                    <div className="ra14-mini-card__actions">
                      <button type="button" className="ra14-button ra14-button--ghost ra14-button--sm" onClick={() => void runSchedule(schedule.id)} disabled={saving}>Run</button>
                      <button
                        type="button"
                        className="ra14-button ra14-button--ghost ra14-button--sm"
                        onClick={() => void postReportsAction({ action: 'delete_schedule', scheduleId: schedule.id }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Unable to delete schedule.'))}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="ra14-panel">
              <div className="ra14-panel__head">
                <div className="ra14-panel__title-wrap">
                  <span className="ra14-panel__icon"><Send size={15} /></span>
                  <span className="ra14-panel__title">Schedule Run History</span>
                </div>
              </div>
              <div className="ra14-mini-list">
                {metaLoading ? <EmptyPanel message="Loading run history..." /> : null}
                {!metaLoading && !runs.length ? <EmptyPanel message="No schedule runs recorded yet." /> : null}
                {!metaLoading && runs.map((run) => (
                  <div key={run.id} className="ra14-mini-card">
                    <div className="ra14-mini-card__copy">
                      <strong>{run.output_file_name || run.export_format.toUpperCase()}</strong>
                      <small>{run.status} • {formatCell({ key: 'started_at', label: 'Started', type: 'datetime' }, run.started_at)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
