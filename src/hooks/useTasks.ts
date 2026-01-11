import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DerivedTask, Metrics, Task } from '@/types';
import {
  computeAverageROI,
  computePerformanceGrade,
  computeRevenuePerHour,
  computeTimeEfficiency,
  computeTotalRevenue,
  withDerived,
  sortTasks as sortDerived,
} from '@/utils/logic';
import { generateSalesTasks } from '@/utils/seed';

interface UseTasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  derivedSorted: DerivedTask[];
  metrics: Metrics;
  lastDeleted: Task | null;
  addTask: (task: Omit<Task, 'id'> & { id?: string }) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  undoDelete: () => void;
  clearLastDeleted: () => void;
}

const INITIAL_METRICS: Metrics = {
  totalRevenue: 0,
  totalTimeTaken: 0,
  timeEfficiencyPct: 0,
  revenuePerHour: 0,
  averageROI: 0,
  performanceGrade: 'Needs Improvement',
};

// StrictMode-safe: prevents double fetch in dev remounts
let cachedTasks: Task[] | null = null;
let inFlight: Promise<Task[]> | null = null;

function normalizeTasks(input: any[]): Task[] {
  const now = Date.now();

  return (Array.isArray(input) ? input : []).map((t, idx) => {
    const created = t?.createdAt ? new Date(t.createdAt) : new Date(now - (idx + 1) * 24 * 3600 * 1000);

    const rev = Number(t?.revenue);
    const time = Number(t?.timeTaken);

    const revenue = Number.isFinite(rev) && rev >= 0 ? rev : 0;
    const timeTaken = Number.isFinite(time) && time > 0 ? time : 1;

    const id =
      typeof t?.id === 'string' && t.id.trim()
        ? t.id
        : (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

    const completedAt =
      t?.completedAt ||
      (t?.status === 'Done'
        ? new Date(created.getTime() + 24 * 3600 * 1000).toISOString()
        : undefined);

    return {
      id,
      title: String(t?.title ?? '').trim() || `Untitled #${idx + 1}`,
      revenue,
      timeTaken,
      priority: t?.priority ?? 'Medium',
      status: t?.status ?? 'Todo',
      notes: t?.notes,
      createdAt: created.toISOString(),
      completedAt,
    } as Task;
  });
}

async function loadTasksOnce(): Promise<Task[]> {
  if (cachedTasks) return cachedTasks;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch('/tasks.json');
    if (!res.ok) throw new Error(`Failed to load tasks.json (${res.status})`);

    const data = (await res.json()) as any[];
    const normalized = normalizeTasks(data);

    // IMPORTANT: no injected outlier rows (no 9,999,999,999 revenue)
    const finalData = normalized.length > 0 ? normalized : generateSalesTasks(50);

    cachedTasks = finalData;
    return finalData;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export function useTasks(): UseTasksState {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Task | null>(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const finalData = await loadTasksOnce();
        if (isMounted) setTasks(finalData);
      } catch (e: any) {
        if (isMounted) setError(e?.message ?? 'Failed to load tasks');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const derivedSorted = useMemo<DerivedTask[]>(() => {
    return sortDerived(tasks.map(withDerived));
  }, [tasks]);

  const metrics = useMemo<Metrics>(() => {
    if (tasks.length === 0) return INITIAL_METRICS;
    const totalRevenue = computeTotalRevenue(tasks);
    const totalTimeTaken = tasks.reduce((s, t) => s + t.timeTaken, 0);
    const timeEfficiencyPct = computeTimeEfficiency(tasks);
    const revenuePerHour = computeRevenuePerHour(tasks);
    const averageROI = computeAverageROI(tasks);
    const performanceGrade = computePerformanceGrade(averageROI);
    return { totalRevenue, totalTimeTaken, timeEfficiencyPct, revenuePerHour, averageROI, performanceGrade };
  }, [tasks]);

  const addTask = useCallback((task: Omit<Task, 'id'> & { id?: string }) => {
    setTasks(prev => {
      const id =
        task.id ??
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const timeTaken = task.timeTaken > 0 ? task.timeTaken : 1;
      const createdAt = new Date().toISOString();
      const completedAt = task.status === 'Done' ? createdAt : undefined;
      return [...prev, { ...task, id, timeTaken, createdAt, completedAt }];
    });
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== id) return t;
        const merged = { ...t, ...patch } as Task;

        if (merged.timeTaken <= 0) merged.timeTaken = 1;
        if (!Number.isFinite(merged.revenue) || merged.revenue < 0) merged.revenue = 0;

        if (t.status !== 'Done' && merged.status === 'Done' && !merged.completedAt) {
          merged.completedAt = new Date().toISOString();
        }
        return merged;
      })
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id) || null;
      setLastDeleted(target);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const clearLastDeleted = useCallback(() => {
    setLastDeleted(null);
  }, []);

  const undoDelete = useCallback(() => {
    if (!lastDeleted) return;
    setTasks(prev => [...prev, lastDeleted]);
    setLastDeleted(null);
  }, [lastDeleted]);

  return {
    tasks,
    loading,
    error,
    derivedSorted,
    metrics,
    lastDeleted,
    addTask,
    updateTask,
    deleteTask,
    undoDelete,
    clearLastDeleted,
  };
}