import React, { useEffect, useMemo, useState } from 'react';
import financeService from '../../lib/api/services/financeService';
import expenseService from '../../lib/api/services/expenseService';
import userService from '../../lib/api/services/userService';
import { ExpenseCategory, PaymentStatus, ProfitLossReport, User } from '../../lib/api/types';
import { useHospitalConfig } from '../../lib/contexts/HospitalConfigContext';

function yyyyMm(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return { start, end, startStr, endStr };
}

type Props = {
  user: any;
};

const ProfitLossPanel: React.FC<Props> = ({ user }) => {
  const { formatCurrency } = useHospitalConfig();
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ProfitLossReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Salaries
  const [salaryMonth, setSalaryMonth] = useState<string>(() => yyyyMm(new Date()));
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [salaryMap, setSalaryMap] = useState<Record<string, number>>({});
  const [savingSalaries, setSavingSalaries] = useState(false);

  // Misc expense form
  const [miscCategory, setMiscCategory] = useState<ExpenseCategory>(ExpenseCategory.ELECTRICITY);
  const [miscDescription, setMiscDescription] = useState('');
  const [miscAmount, setMiscAmount] = useState('0');
  const [miscDate, setMiscDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [miscStatus, setMiscStatus] = useState<PaymentStatus>(PaymentStatus.PAID);

  const isAdmin = user?.role === 'ADMIN';

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const r = await financeService.getProfitLoss({ from, to });
      setReport(r);
    } catch (e: any) {
      console.error('Failed to load P/L', e);
      setError(e?.message || 'Failed to load P/L');
    } finally {
      setLoading(false);
    }
  };

  const loadUsersAndSalaries = async () => {
    const { startStr, endStr } = monthRange(salaryMonth);
    try {
      const u = await userService.getUsers({ isActive: true, page: 1, limit: 200 });
      const users = (u.users || []).slice().sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      setActiveUsers(users);

      const s = await expenseService.getExpenses({
        from: startStr,
        to: endStr,
        category: ExpenseCategory.SALARY,
        limit: 200,
      });

      const map: Record<string, number> = {};
      (s.data || []).forEach((exp: any) => {
        if (exp.userId) map[exp.userId] = Number(exp.amount || 0);
      });

      // ensure all users exist in map (default 0)
      users.forEach((usr) => {
        if (map[usr.id] === undefined) map[usr.id] = 0;
      });
      setSalaryMap(map);
    } catch (e) {
      console.error('Failed to load users/salaries', e);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadReport();
  }, [from, to, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsersAndSalaries();
  }, [salaryMonth, isAdmin]);

  const salaryTotal = useMemo(() => {
    return Object.values(salaryMap).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [salaryMap]);

  const netMarginPct = useMemo(() => {
    const totalEarnings = report?.revenue?.total ?? 0;
    const profitOrLoss = report?.profitOrLoss ?? 0;
    if (totalEarnings === 0) return 0;
    return (profitOrLoss / totalEarnings) * 100;
  }, [report?.revenue?.total, report?.profitOrLoss]);

  const saveSalaries = async () => {
    setSavingSalaries(true);
    setError('');
    try {
      const items = activeUsers.map((u) => ({
        userId: u.id,
        amount: Number(salaryMap[u.id] || 0),
        paymentStatus: PaymentStatus.PAID,
      }));
      await expenseService.upsertMonthlySalaries({ month: salaryMonth, items });
      await loadReport();
    } catch (e: any) {
      console.error('Failed to save salaries', e);
      setError(e?.message || 'Failed to save salaries');
    } finally {
      setSavingSalaries(false);
    }
  };

  const addMiscExpense = async () => {
    setError('');
    try {
      await expenseService.createExpense({
        category: miscCategory,
        description: miscDescription || `${miscCategory} expense`,
        amount: Number(miscAmount || 0),
        expenseDate: miscDate,
        paymentStatus: miscStatus,
        paidAt: miscStatus === PaymentStatus.PAID ? new Date().toISOString() : null,
      });
      setMiscDescription('');
      setMiscAmount('0');
      await loadReport();
    } catch (e: any) {
      console.error('Failed to add expense', e);
      setError(e?.message || 'Failed to add expense');
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: 12, backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8' }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Profit &amp; Loss</div>
        <div style={{ color: '#6B7280' }}>Only Admin can access P/L reports.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'end', backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#374151' }}>From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 12, color: '#374151' }}>To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }} />
        </div>
        <button onClick={loadReport} disabled={loading} style={{ padding: '6px 10px', border: '1px solid #5A6268', backgroundColor: loading ? '#C8C8C8' : '#6C757D', color: '#FFF', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {error && <div style={{ marginLeft: 'auto', color: '#991B1B', fontSize: 13 }}>{error}</div>}
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: 10 }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Total Earnings</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(report?.revenue.total || 0)}</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>OPD: {formatCurrency(report?.revenue.opd || 0)} · IPD: {formatCurrency(report?.revenue.ipd || 0)}</div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: 10 }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Total Expenses</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(report?.expenses.total || 0)}</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Manual: {formatCurrency(report?.expenses.manual || 0)} · Purchases: {formatCurrency(report?.expenses.medicinePurchases || 0)}</div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: 10 }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Profit / Loss</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: (report?.profitOrLoss || 0) >= 0 ? '#065F46' : '#991B1B' }}>
            {formatCurrency(report?.profitOrLoss || 0)}
          </div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>{(report?.profitOrLoss || 0) >= 0 ? 'Profit' : 'Loss'}</div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: 10 }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Net Margin</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: netMarginPct >= 0 ? '#065F46' : '#991B1B' }}>
            {netMarginPct.toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Profit / Revenue</div>
        </div>
        <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8', padding: 10 }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Salaries (month)</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrency(salaryTotal)}</div>
          <div style={{ fontSize: 12, color: '#6B7280' }}>Selected month: {salaryMonth}</div>
        </div>
      </div>

      {/* Salaries */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderBottom: '1px solid #C8C8C8' }}>
          <div style={{ fontWeight: 700 }}>Salaries (Admin)</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="month" value={salaryMonth} onChange={(e) => setSalaryMonth(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }} />
            <button onClick={saveSalaries} disabled={savingSalaries} style={{ padding: '6px 10px', border: '1px solid #005A9E', backgroundColor: savingSalaries ? '#C8C8C8' : '#0078D4', color: '#FFF', cursor: savingSalaries ? 'not-allowed' : 'pointer' }}>
              {savingSalaries ? 'Saving…' : 'Save Salaries'}
            </button>
          </div>
        </div>
        <div style={{ padding: 10 }}>
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
            All active users are listed below. Enter salary amounts for the selected month. These are counted as expenses in P/L.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#6B7280' }}>User</th>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#6B7280' }}>Role</th>
                  <th style={{ padding: '6px 8px', fontSize: 12, color: '#6B7280' }}>Salary</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '6px 8px' }}>{u.fullName}</td>
                    <td style={{ padding: '6px 8px', color: '#6B7280', fontSize: 13 }}>{u.role}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        type="number"
                        value={salaryMap[u.id] ?? 0}
                        onChange={(e) => setSalaryMap((prev) => ({ ...prev, [u.id]: Number(e.target.value || 0) }))}
                        style={{ padding: '4px 8px', border: '1px solid #C8C8C8', width: 140 }}
                      />
                    </td>
                  </tr>
                ))}
                {activeUsers.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ padding: '10px 8px', color: '#6B7280' }}>
                      No active users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Misc Expenses */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #C8C8C8' }}>
        <div style={{ padding: 10, borderBottom: '1px solid #C8C8C8', fontWeight: 700 }}>Miscellaneous Expenses (Admin)</div>
        <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#374151' }}>Category</label>
            <select value={miscCategory} onChange={(e) => setMiscCategory(e.target.value as any)} style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }}>
              {[ExpenseCategory.ELECTRICITY, ExpenseCategory.RENT, ExpenseCategory.MAINTENANCE, ExpenseCategory.EQUIPMENT, ExpenseCategory.SUPPLIES, ExpenseCategory.OTHER].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#374151' }}>Description</label>
            <input value={miscDescription} onChange={(e) => setMiscDescription(e.target.value)} placeholder="Electricity bill, generator fuel…" style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#374151' }}>Amount</label>
            <input type="number" value={miscAmount} onChange={(e) => setMiscAmount(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#374151' }}>Date</label>
            <input type="date" value={miscDate} onChange={(e) => setMiscDate(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 12, color: '#374151' }}>Status</label>
            <select value={miscStatus} onChange={(e) => setMiscStatus(e.target.value as any)} style={{ padding: '4px 8px', border: '1px solid #C8C8C8' }}>
              <option value={PaymentStatus.PAID}>PAID</option>
              <option value={PaymentStatus.PENDING}>PENDING</option>
            </select>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={addMiscExpense} style={{ padding: '6px 10px', border: '1px solid #005A9E', backgroundColor: '#0078D4', color: '#FFF' }}>
              Add Expense
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfitLossPanel;

