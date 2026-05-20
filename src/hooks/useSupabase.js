import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ─── Generic realtime hook ───
export function useRealtimeTable(table, orderBy = 'created_at', filter = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    let query = supabase.from(table).select('*').order(orderBy);
    if (filter) {
      query = query.eq(filter.column, filter.value);
    }
    const { data: rows, error } = await query;
    if (!error) setData(rows || []);
    setLoading(false);
  }, [table, orderBy, filter?.column, filter?.value]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`${table}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter: `${filter.column}=eq.${filter.value}` } : {}),
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, table, filter?.column, filter?.value]);

  return { data, loading, refetch: fetchData };
}

// ─── Projects ───
export function useProjects() {
  return useRealtimeTable('projects', 'priority');
}

// ─── Areas for a project ───
export function useAreas(projectId) {
  return useRealtimeTable('areas', 'sort_order', projectId ? { column: 'project_id', value: projectId } : null);
}

// ─── Furniture for an area ───
export function useFurniture(areaId) {
  return useRealtimeTable('furniture', 'sort_order', areaId ? { column: 'area_id', value: areaId } : null);
}

// ─── Activity Log ───
export function useActivityLog(projectId = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    let query = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    const { data: rows } = await query;
    setData(rows || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('activity-log-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => fetchData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  return { data, loading, refetch: fetchData };
}

// ─── Planning Tasks ───
export function usePlanningTasks() {
  return useRealtimeTable('planning_tasks', 'priority');
}

// ─── CRUD helpers ───

export async function createProject({ name, client, notes, priority }) {
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, client, notes, priority })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, updates) {
  const { error } = await supabase
    .from('projects')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteProject(id) {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

export async function createArea({ project_id, name, mecanizados_enabled = [], sort_order = 0 }) {
  const { data, error } = await supabase
    .from('areas')
    .insert({ project_id, name, mecanizados_enabled, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateArea(id, updates) {
  const { error } = await supabase
    .from('areas')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteArea(id) {
  const { error } = await supabase.from('areas').delete().eq('id', id);
  if (error) throw error;
}

export async function createFurniture({ area_id, name, notes = '', image_url = '', sort_order = 0 }) {
  const { data, error } = await supabase
    .from('furniture')
    .insert({ area_id, name, notes, image_url, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFurniture(id, updates) {
  const { error } = await supabase.from('furniture').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteFurniture(id) {
  const { error } = await supabase.from('furniture').delete().eq('id', id);
  if (error) throw error;
}

export async function logActivity({ project_id, area_id = null, action, stage = '', description, user_name = '' }) {
  const { error } = await supabase
    .from('activity_log')
    .insert({ project_id, area_id, action, stage, description, user_name });
  if (error) console.error('Activity log error:', error);
}

export async function createPlanningTask(task) {
  const { data, error } = await supabase
    .from('planning_tasks')
    .insert(task)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePlanningTask(id, updates) {
  const { error } = await supabase
    .from('planning_tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePlanningTask(id) {
  const { error } = await supabase.from('planning_tasks').delete().eq('id', id);
  if (error) throw error;
}

// ─── Image upload ───
export async function uploadFurnitureImage(file) {
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;
  const { data, error } = await supabase.storage
    .from('furniture-images')
    .upload(fileName, file);
  if (error) throw error;
  const { data: urlData } = supabase.storage
    .from('furniture-images')
    .getPublicUrl(data.path);
  return urlData.publicUrl;
}
