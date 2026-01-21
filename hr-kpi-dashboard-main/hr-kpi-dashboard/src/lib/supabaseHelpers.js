import { supabase, getUserId } from './supabase';

// Initialize user context
export const initializeUserContext = async () => {
  const userId = getUserId();
  return userId;
};

// Save uploaded file metadata
export const saveUploadedFile = async (fileType, fileName, rowCount) => {
  const userId = getUserId();
  
  const { data, error } = await supabase
    .from('uploaded_files')
    .upsert({
      user_id: userId,
      file_type: fileType,
      file_name: fileName,
      row_count: rowCount,
      uploaded_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,file_type'
    });

  if (error) {
    console.error('Error saving file metadata:', error);
    return null;
  }
  return data;
};

// Get all uploaded files for user
export const getUploadedFiles = async () => {
  const userId = getUserId();
  
  const { data, error } = await supabase
    .from('uploaded_files')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching files:', error);
    return [];
  }
  return data || [];
};

export const saveCalculatedKPI = async (kpiName, kpiValue, metadata = null) => {
  const userId = getUserId();
  
  console.log('💾 SAVING KPI:', {
    userId,
    kpiName,
    kpiValue,
    metadata
  });
  
  const saveData = {
    user_id: userId,
    kpi_name: kpiName,
    kpi_value: kpiValue,
    calculated_at: new Date().toISOString()
  };
  
  // Only add metadata if it's not null/empty
  if (metadata !== null && metadata !== undefined) {
    saveData.metadata = metadata;
  }
  
  const { data, error } = await supabase
    .from('calculated_kpis')
    .upsert(saveData, {
      onConflict: 'user_id,kpi_name'
    });

  if (error) {
    console.error('❌ Error saving KPI:', error);
    return null;
  }
  
  console.log('✅ KPI saved:', kpiName);
  return data;
};

// Get all calculated KPIs for user
export const getCalculatedKPIs = async () => {
  const userId = getUserId();
  
  console.log('📥 FETCHING KPIs for user:', userId);
  
  const { data, error } = await supabase
    .from('calculated_kpis')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('❌ Error fetching KPIs:', error);
    return [];
  }
  
  console.log('📦 FETCHED', data?.length || 0, 'KPIs:', data);
  
  return data || [];
};

// Get date ranges for user
export const getDateRanges = async () => {
  const userId = getUserId();
  
  const { data, error } = await supabase
    .from('date_ranges')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching date ranges:', error);
    return [];
  }
  return data || [];
};
// Save date range
export const saveDateRange = async (rangeType, startDate, endDate) => {
  const userId = getUserId();
  
  const { data, error } = await supabase
    .from('date_ranges')
    .upsert({
      user_id: userId,
      range_type: rangeType,
      start_date: startDate,
      end_date: endDate,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,range_type'
    });

  if (error) {
    console.error('Error saving date range:', error);
    return null;
  }
  return data;
};
// Save EDM chart data
export const saveEDMChartData = async (companyData, typeData) => {
  const userId = getUserId();
  
  const { data, error } = await supabase
    .from('edm_chart_data')
    .upsert({
      user_id: userId,
      company_data: companyData,
      type_data: typeData,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('Error saving chart data:', error);
    return null;
  }
  return data;
};

// Get EDM chart data for user
export const getEDMChartData = async () => {
  const userId = getUserId();
  
  const { data, error } = await supabase
    .from('edm_chart_data')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    console.error('Error fetching chart data:', error);
    return null;
  }
  return data;
};

// Clear all user data
export const clearAllUserData = async () => {
  const userId = getUserId();
  
  await Promise.all([
    supabase.from('uploaded_files').delete().eq('user_id', userId),
    supabase.from('calculated_kpis').delete().eq('user_id', userId),
    supabase.from('date_ranges').delete().eq('user_id', userId),
    supabase.from('edm_chart_data').delete().eq('user_id', userId)
  ]);
};
