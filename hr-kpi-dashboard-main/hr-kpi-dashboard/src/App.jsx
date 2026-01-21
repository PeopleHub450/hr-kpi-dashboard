import {
  saveUploadedFile,
  getUploadedFiles,
  saveCalculatedKPI,
  getCalculatedKPIs,
  saveDateRange,
  getDateRanges,
  saveEDMChartData,
  getEDMChartData,
  initializeUserContext,
  clearAllUserData
} from './lib/supabaseHelpers';
import React, { useState, useEffect } from "react";
import * as XLSX from 'xlsx';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, BookOpen, Briefcase, X, Upload, RefreshCw, CheckCircle, AlertCircle, ThumbsUp } from 'lucide-react';

const HRKPIDashboard = () => {
  const [edmChartData, setEdmChartData] = useState({ company: [], type: [] });
  const [selectedPillar, setSelectedPillar] = useState('all');
  const [selectedKPI, setSelectedKPI] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({});
  const [calculatedKPIs, setCalculatedKPIs] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState({
    edmReport: null,
    recruitmentTracker: null,
    enpsSurvey: null,
    linkedinLearnerDetail: null,
    linkedinLearning: null,
    linkedinFollowers: null,
    linkedinVisitors: null,
    linkedinContent: null,
    talentxData: null
  });

  const [dateRange, setDateRange] = useState({
    startDate: '2025-01-01',
    endDate: '2025-12-31'
  });
  const [turnoverDateRange, setTurnoverDateRange] = useState({
    startDate: '2025-07-01',
    endDate: '2025-12-31'
  });
  const [timeToFillDateRange, setTimeToFillDateRange] = useState({
    startDate: '2025-07-01',
    endDate: '2025-12-31'
  });
  
  // Wrap the setDateRange
  const updateDateRange = async (newRange) => {
    setDateRange(newRange);
    await saveDateRange('linkedin', newRange.startDate, newRange.endDate);
  };
  
  const updateTurnoverDateRange = async (newRange) => {
    setTurnoverDateRange(newRange);
    await saveDateRange('turnover', newRange.startDate, newRange.endDate);
  };
  
  const updateTimeToFillDateRange = async (newRange) => {
    setTimeToFillDateRange(newRange);
    await saveDateRange('timeToFill', newRange.startDate, newRange.endDate);
  };
  
  useEffect(() => {
    const loadSampleEDMData = async () => {
      try {
        // Try to load sample EDM data from your GitHub repo
        // Replace YOUR_USERNAME and YOUR_REPO with actual values
        const response = await fetch('https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/sample_edm.json');
        if (response.ok) {
          const data = await response.json();
          const chartData = calculateEDMCharts(data);
          setEdmChartData(chartData);
          console.log('Sample EDM data loaded successfully');
        }
      } catch (error) {
        console.log('Sample data not available - users must upload EDM file');
      }
    };
    
    loadSampleEDMData();
  }, []);
// Load persisted data from Supabase
  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        await initializeUserContext();
        
        // Load date ranges
        const ranges = await getDateRanges();
        ranges.forEach(range => {
          if (range.range_type === 'linkedin') {
            setDateRange({ startDate: range.start_date, endDate: range.end_date });
          } else if (range.range_type === 'turnover') {
            setTurnoverDateRange({ startDate: range.start_date, endDate: range.end_date });
          } else if (range.range_type === 'timeToFill') {
            setTimeToFillDateRange({ startDate: range.start_date, endDate: range.end_date });
          }
        });
        
        // Load calculated KPIs
        const kpis = await getCalculatedKPIs();
        console.log('Loaded KPIs from database:', kpis);
        const kpiObj = {};
        
        kpis.forEach(kpi => {
          const kpiName = kpi.kpi_name;
          
          // Special handling for complex objects stored in metadata
          if (kpiName === 'diversityBreakdowns' || 
              kpiName === 'aiTraining' || 
              kpiName === 'linkedinEngagement') {
            kpiObj[kpiName] = kpi.metadata;
          }
          // Simple numeric values
          else if (kpi.kpi_value !== null && kpi.kpi_value !== undefined) {
            kpiObj[kpiName] = parseFloat(kpi.kpi_value);
          }
        });
        console.log('Processed KPI object:', kpiObj); // DEBUG
        setCalculatedKPIs(kpiObj);
        
        // Load EDM chart data
        const chartData = await getEDMChartData();
        if (chartData) {
          setEdmChartData({
            company: chartData.company_data || [],
            type: chartData.type_data || []
          });
        }
        
        // Load uploaded files metadata
        const files = await getUploadedFiles();
        const fileObj = {};
        files.forEach(file => {
          fileObj[file.file_type] = { 
            name: file.file_name, 
            rowCount: file.row_count 
          };
        });
        // Note: We store metadata, not actual file data
        
        console.log('Loaded persisted data from Supabase');
      } catch (error) {
        console.error('Error loading persisted data:', error);
      }
    };
    
    loadPersistedData();
  }, []);
  // Utility: convert Excel serial date to JS Date (handles numbers produced by some XLSX exports)
  const excelSerialToDate = (serial) => {
    if (serial == null || serial === '') return null;
    if (serial instanceof Date) return serial;
    if (typeof serial !== 'number') return null;
    // Convert Excel serial date (days since 1899-12-31) to JS Date
    const utcDays = serial - 25569;
    const utcValue = utcDays * 86400; // seconds
    const date = new Date(utcValue * 1000);
    return isNaN(date.getTime()) ? null : date;
  };

  // Robust parser that accepts Date objects, ISO strings, or Excel serial numbers
  const parseMaybeDate = (val) => {
    if (!val && val !== 0) return null;
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
      return excelSerialToDate(val);
    }
    const dt = new Date(val);
    return isNaN(dt.getTime()) ? null : dt;
  };

  // Parse Excel file using local xlsx package
const parseExcelFile = async (file, sheetName = null, fileType = null) => {
  return new Promise((resolve, reject) => {
    console.log('Starting to parse file:', file.name, file.type, file.size);
    
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        console.log('File loaded, parsing...');
        const data = new Uint8Array(e.target.result);
        console.log('Data array length:', data.length);
        
        const workbook = XLSX.read(data, { type: 'array' });
        console.log('Workbook parsed, sheets:', workbook.SheetNames);
        
        // Determine target sheet
        let targetSheet;
        
        if (sheetName && workbook.SheetNames.includes(sheetName)) {
          // User specified exact sheet name and it exists
          targetSheet = sheetName;
        } else if (fileType === 'linkedinLearning') {
          // Use smart detection for LinkedIn Learning
          targetSheet = findBestSheetForLearning(workbook);
        } else if (fileType === 'talentxData') {
          // For TalentX, use the sheetName passed in (either 'Employee data' or 'TalentX - Master Sheet')
          if (sheetName && workbook.SheetNames.includes(sheetName)) {
            targetSheet = sheetName;
          } else {
            // Try to find similar sheet names
            const similar = workbook.SheetNames.find(name => 
              name.toLowerCase().includes(sheetName.toLowerCase())
            );
            targetSheet = similar || workbook.SheetNames[0];
          }
        } else if (sheetName) {
          // User specified sheet but it doesn't exist - try to find similar
          console.warn(`Specified sheet "${sheetName}" not found, searching for similar...`);
          const similar = workbook.SheetNames.find(name => 
            name.toLowerCase().includes(sheetName.toLowerCase())
          );
          targetSheet = similar || workbook.SheetNames[0];
        } else {
          // Default to first sheet
          targetSheet = workbook.SheetNames[0];
        }
        
        console.log('Reading from sheet:', targetSheet);
        
        const worksheet = workbook.Sheets[targetSheet];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          defval: null, 
          raw: false, 
          cellDates: true, 
          dateNF: 'yyyy-mm-dd' 
        });
        
        console.log('JSON data created, rows:', jsonData.length);
        if (jsonData.length > 0) {
          console.log('First row sample:', jsonData[0]);
          console.log('Available columns:', Object.keys(jsonData[0]));
        }
        
        // Validate data has Email column if needed
        if (fileType === 'linkedinLearning' || fileType === 'linkedinLearnerDetail') {
          if (jsonData.length === 0) {
            reject(new Error(`No data found in sheet: ${targetSheet}`));
            return;
          }
          
          const hasEmail = jsonData[0].hasOwnProperty('Email') || 
                          jsonData[0].hasOwnProperty('email') ||
                          Object.keys(jsonData[0]).some(key => 
                            key.toLowerCase().includes('email')
                          );
          
          if (!hasEmail) {
            console.warn(`Warning: No Email column found in sheet ${targetSheet}`);
            console.warn('Available columns:', Object.keys(jsonData[0]));
          }
        }
        
        resolve(jsonData);
      } catch (error) {
        console.error('Error in onload:', error);
        reject(error);
      }
    };

    reader.onerror = (error) => {
      console.error('FileReader error:', error);
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// Smart sheet detection for LinkedIn Learning Report
const findBestSheetForLearning = (workbook) => {
  const sheetNames = workbook.SheetNames;
  console.log('Available sheets:', sheetNames);
  
  // Priority 1: Exact match for "LinkedIn Learner Summary"
  if (sheetNames.includes('LinkedIn Learner Summary')) {
    console.log('Found exact match: LinkedIn Learner Summary');
    return 'LinkedIn Learner Summary';
  }
  
  // Priority 2: Case-insensitive match for common variations
  const commonNames = [
    'linkedin learner summary',
    'learner summary',
    'summary',
    'licenses',
    'learning summary',
    'employee learning'
  ];
  
  for (const commonName of commonNames) {
    const found = sheetNames.find(name => 
      name.toLowerCase().includes(commonName)
    );
    if (found) {
      console.log(`Found matching sheet: ${found}`);
      return found;
    }
  }
  
  // Priority 3: Look for sheets with "learner" or "license" in name
  const learnerSheet = sheetNames.find(name => 
    name.toLowerCase().includes('learner') || 
    name.toLowerCase().includes('license')
  );
  
  if (learnerSheet) {
    console.log(`Found sheet with learner/license keyword: ${learnerSheet}`);
    return learnerSheet;
  }
  
  // Priority 4: Use first sheet if it has Email column
  console.log(`No matching sheet found, checking first sheet: ${sheetNames[0]}`);
  const firstSheet = workbook.Sheets[sheetNames[0]];
  const firstSheetData = XLSX.utils.sheet_to_json(firstSheet, { 
    defval: null, 
    raw: false,
    header: 1  // Get first row as array to check headers
  });
  
  if (firstSheetData.length > 0) {
    const headers = firstSheetData[0];
    const hasEmail = headers.some(h => 
      h && h.toString().toLowerCase().includes('email')
    );
    
    if (hasEmail) {
      console.log(`First sheet has Email column, using: ${sheetNames[0]}`);
      return sheetNames[0];
    }
  }
  
  // Fallback: just use first sheet
  console.warn(`No suitable sheet found, defaulting to: ${sheetNames[0]}`);
  return sheetNames[0];
};
  
  const getKPIData = () => [
    {
      companyPillar: 'Talent Acquisition',
      hrPillar: 'P&C Organization',
      kpi: 'Hiring Quality',
      target: '20% of hires meeting or exceeding performance expectations',
      currentValue: 0,
      targetValue: 20,
      status: 'Start Tracking',
      icon: '👥',
      calculable: false,
      details: {
        description: 'This KPI measures the quality of new hires based on performance reviews and manager feedback.',
        dataSource: null,
        formula: null
      }
    },
    {
      companyPillar: 'Talent Acquisition',
      hrPillar: 'P&C Organization',
      kpi: 'People Turnover Rate',
      target: 'Reduce turnover rate by 5%',
      currentValue: calculatedKPIs.turnoverRate !== undefined ? calculatedKPIs.turnoverRate : 34.4,
      targetValue: 5,
      status: 'In Progress',
      icon: '📉',
      calculable: true,
      dataFile: 'edmReport',
      details: {
        description: 'The turnover rate for the year 2025 is calculated from the EDM Report, which tracks employee exits and headcount data throughout the year.',
        dataSource: 'EDM Report',
        formula: 'Turnover Rate (%) = (Number of Exits / Average Headcount) × 100',
        additionalInfo: 'This metric helps identify retention challenges and measure the effectiveness of employee engagement initiatives.'
      }
    },
    {
      companyPillar: 'Talent Acquisition',
      hrPillar: 'P&C Organization',
      kpi: 'Time to Fill',
      target: 'Reduce average time to fill critical positions by 5%',
      // Use null as default to indicate not available (avoids negative placeholder)
      currentValue: calculatedKPIs.timeToFill !== undefined ? calculatedKPIs.timeToFill : null,
      targetValue: 5,
      status: 'In Progress',
      icon: '⏱️',
      calculable: true,
      dataFile: 'recruitmentTracker',
      details: {
        description: 'Measures the efficiency of the recruitment process by tracking days from job posting to offer acceptance.',
        dataSource: 'Recruitment Tracker',
        formula: 'This KPI tracks the average Time to Fill using system-recorded values. The 2024 average serves as the baseline, while 2025 performance is measured against a 5% reduction target.',
        additionalInfo: 'Average Time to Fill increased by 14% in 2025 compared to the 2024 baseline, indicating a slower hiring cycle.'
      }
    },
    {
      companyPillar: 'Talent Acquisition',
      hrPillar: 'Leadership & Culture',
      kpi: 'Diversity & Inclusion Index',
      target: 'Ensure an average of 10% workplace diversity (including age, gender and minority groups)',
      currentValue: calculatedKPIs.diversityIndex !== undefined ? calculatedKPIs.diversityIndex : 27.9,
      targetValue: 10,
      status: 'In Progress',
      icon: '🤝',
      calculable: true,
      dataFile: 'edmReport',
      details: {
        description: 'Tracks workplace diversity across multiple dimensions including age, gender, and minority representation.',
        dataSource: 'EDM Report',
        formula: 'Diversity Index = Average of (Gender Diversity + Age Diversity + Religious Diversity)',
        additionalInfo: 'The current diversity index indicates the organization has exceeded its 10% target, showing strong representation across gender, age groups, and religious backgrounds.'
      }
    },
    {
      companyPillar: 'Talent Management',
      hrPillar: 'Talent & Skills',
      kpi: 'Botnostic Solutions - Talent Management',
      target: 'Track assessment participation and training engagement',
      currentValue: calculatedKPIs.botnosticSolutions?.assessmentGiven || 0,
      targetValue: 100,
      status: 'In Implementation',
      icon: '🎯',
      calculable: true,
      dataFile: 'talentxData',
      details: {
        description: 'Tracks talent management and training needs assessment through the Botnostic platform, measuring employee assessment participation and training progress.',
        dataSource: 'TalentX Data (Master Sheet & Employee Data)',
        formula: 'Total Assessments Given = Distinct employee_id from Employee Data sheet | People Logged In = Distinct employee_code from Master Sheet | Training Started = Count where training_progress_percentage > 0',
        additionalInfo: calculatedKPIs.botnosticSolutions 
          ? `${calculatedKPIs.botnosticSolutions.assessmentGiven} employees given assessment | ${calculatedKPIs.botnosticSolutions.loggedIn} logged into platform | ${calculatedKPIs.botnosticSolutions.trainingStarted} started training`
          : 'Upload TalentX Data to see Botnostic platform analytics.',
        achievements: [
          'Business Requirements Document (BRD) finalized',
          'Promotion policy framework established',
          'Performance Development Plan (PDP) template created',
          'Current grade structure documented',
          'Over 10 job descriptions standardized',
          'Business unit organograms mapped',
          'Contract executed and implementation underway'
        ]
      }  
    },
    {
      companyPillar: 'Talent Management',
      hrPillar: 'P&C Organization',
      kpi: 'AI-Driven P&C Processes',
      target: 'Implement AI in 25% of P&C processes',
      currentValue: 0,
      targetValue: 25,
      status: 'In Progress',
      icon: '🤖',
      calculable: false,
      details: {
        description: 'Tracks the adoption of AI technology across HR processes to improve efficiency, decision-making, and employee experience through intelligent automation.',
        dataSource: 'Internal AI Implementation Tracking',
        formula: null,
        aiTools: [
          {
            name: 'Feedalytics',
            category: 'AI Resume Intelligence, JD Generator & Interview Analytics',
            achievements: [
              'Time to fill reduced by 11% (from 25.04 to 22.7 days)',
              'Achieved shortlisting accuracy of 72% across 23 positions',
              'Reduced resume screening time from 5-8 minutes to under 30 seconds',
              'Streamlined job description creation process'
            ],
            status: 'Operational'
          },
          {
            name: 'LinkedIn Learning AI Coaching',
            category: 'AI-Powered Employee Development',
            achievements: [
              'Completed LM Readiness session with learning dashboard access',
              'Identified domain-specific learning paths (Tech, Presales, Customer Delight, Account Management, Productivity, Technical)',
              'Achieved 97% completion rate across training programs',
              'Delivered AI coaching insights to enhance skill development'
            ],
            status: 'Achieved'
          },
          {
            name: 'Botnostic Solutions',
            category: 'Talent Management & Training Needs Assessment',
            achievements: [
              'Business Requirements Document (BRD) finalized',
              'Promotion policy framework established',
              'Performance Development Plan (PDP) template created',
              'Current grade structure documented',
              'Over 10 job descriptions standardized',
              'Business unit organograms mapped',
              'Contract executed and implementation underway'
            ],
            status: 'In Implementation'
          },
          {
            name: 'HR Chatbot',
            category: 'AI-Driven HR Resource & Workforce Analytics',
            achievements: [
              'Successfully reviewed all 44 HR policies through AI analysis',
              'Implemented intelligent questioning system for policy accuracy',
              'Streamlined employee access to HR resources',
              'Real-time workforce insights enabled for strategic decision-making',
              'Currently refining data accuracy based on initial feedback'
            ],
            status: 'In Refinement'
          }
        ],
        additionalInfo: 'Four AI-powered solutions are actively transforming P&C operations: Feedalytics for recruitment intelligence, LinkedIn Learning for AI coaching, Botnostic for talent management, and an HR Chatbot for employee self-service and analytics.'
      }
    },
    {
      companyPillar: 'Talent Management',
      hrPillar: 'Leadership & Culture',
      kpi: 'Employee Engagement Score',
      target: 'Achieve at least 20% engagement',
      currentValue: calculatedKPIs.engagementScore !== undefined ? calculatedKPIs.engagementScore : 69,
      targetValue: 20,
      status: 'In Progress',
      icon: '💪',
      calculable: true,
      dataFile: 'enpsSurvey',
      details: {
        description: 'Measures employee satisfaction, advocacy, and cultural alignment using employee survey responses.',
        dataSource: 'eNPS & cNPS Survey',
        formula: 'Employee Engagement Score (%) = Average of (eNPS Percentage + Culture Score Percentage)',
        additionalInfo: 'The current engagement score reflects employee willingness to recommend the organization and their perception of company culture.'
      }
    },
    {
      companyPillar: 'Learning',
      hrPillar: 'Talent & Skills',
      kpi: 'AI Training',
      target: '35% of permanent employees trained in AI tools',
      currentValue: calculatedKPIs.aiTraining?.percentage !== undefined ? calculatedKPIs.aiTraining.percentage : 75,
      targetValue: 35,
      status: 'In Progress',
      icon: '🎓',
      calculable: true,
      dataFile: 'linkedinLearnerDetail',
      dataSource: 'LinkedIn Learner Detail Report',
      details: {
        description: 'Tracks the percentage of employees who have completed AI tools training programs with 80% or higher completion rate.',
        dataSource: 'LinkedIn Learner Detail Report',
        formula: 'AI Training (%) = (Employees with ≥80% completion in AI/Artificial Intelligence courses / Total LinkedIn Learning License Holders) × 100',
        additionalInfo: calculatedKPIs.aiTraining && typeof calculatedKPIs.aiTraining === 'object'
      ? `${calculatedKPIs.aiTraining.totalLearners} employees have LinkedIn Learning licenses. ${calculatedKPIs.aiTraining.aiTrained} employees (${calculatedKPIs.aiTraining.percentage}%) have completed AI training. ${calculatedKPIs.totalActiveEmployees || 'N/A'} total active employees in the organization.`
      : 'Upload LinkedIn Learner Detail Report to see detailed statistics.'
      }
    },
    {
      companyPillar: 'Learning',
      hrPillar: 'Talent & Skills',
      kpi: 'Talent Development',
      target: '60% completion rate of skill development',
      currentValue: calculatedKPIs.talentDevelopment !== undefined ? calculatedKPIs.talentDevelopment : 6.7,
      targetValue: 60,
      status: 'In Progress',
      icon: '📚',
      calculable: true,
      dataFile: 'linkedinLearning',
      dataSource: 'LinkedIn Learning Report',
      details: {
        description: 'Measures the percentage of employees who have completed 80% or more of their assigned learning and development target hours.',
        dataSource: 'LinkedIn Learning Report',
        formula: 'Talent Development (%) = (Employees with ≥80% target completion / Total Employees in sheet) × 100',
        additionalInfo: 'Employees are considered to have fulfilled their talent development target once they complete at least 80% of their assigned LinkedIn Learning hours.'
      }
    },
    {
      companyPillar: 'Employer Branding',
      hrPillar: 'P&C Organization',
      kpi: 'LinkedIn Page Engagement',
      target: 'Increase LinkedIn followers by 20%, achieve 5,000 total page views, and reach 10,000 total impressions',
      currentValue: calculatedKPIs.linkedinEngagement?.followers || 0,
      targetValue: 20,
      status: 'In Progress',
      icon: '📱',
      calculable: true,
      dataFile: 'linkedinFollowers',
      details: {
        description: 'Tracks the People and Culture LinkedIn page performance through follower growth, page views, and content impressions to measure employer brand visibility and engagement.',
        dataSource: 'LinkedIn Followers Report, Visitors Report, and Content Report',
        formula: 'Metrics calculated over selected date range: Total Followers (end of period), Total Page Views (sum), Total Impressions (sum)',
        additionalInfo: calculatedKPIs.linkedinEngagement 
          ? `Followers: ${calculatedKPIs.linkedinEngagement.followers || 0} | Page Views: ${calculatedKPIs.linkedinEngagement.pageViews || 0} | Impressions: ${calculatedKPIs.linkedinEngagement.impressions || 0}`
          : 'Upload LinkedIn reports to see detailed engagement metrics.'
      }
    }
  ];

  const kpiData = getKPIData();
  const calculateAITraining = (learnerData, totalLicenses = null) => {
    try {
      // Find email column (case-insensitive)
      const firstRow = learnerData[0];
      const emailColumn = Object.keys(firstRow).find(key => 
        key.toLowerCase().includes('email')
      );
      
      if (!emailColumn) {
        console.error('No Email column found in Learner Detail data');
        return null;
      }
      
      // Determine total learners
      let totalLearners = 0;
      
      if (totalLicenses !== null && totalLicenses > 0) {
        totalLearners = totalLicenses;
        console.log('Using LinkedIn Learning Report total:', totalLearners);
      } else {
        const allLearners = new Set();
        learnerData.forEach(row => {
          const email = row[emailColumn];
          if (email) {
            allLearners.add(email.trim().toLowerCase());
          }
        });
        totalLearners = allLearners.size;
        console.log('Using Learner Detail total (fallback):', totalLearners);
      }
    
      if (totalLearners === 0) return null;
    
      const aiTrainedEmails = new Set();
    
      learnerData.forEach(row => {
        const email = row[emailColumn];
        const percentCompleted = row['Percent Completed'];
        const skills = row['Skills'];
    
        if (!email || !skills) return;
    
        const skillsLower = skills.toLowerCase();
        const isAICourse = skillsLower.includes('artificial intelligence') || 
                          skillsLower.includes(' ai ') || 
                          skillsLower.startsWith('ai ') || 
                          skillsLower.endsWith(' ai');
    
        if (isAICourse) {
          let completionPercent = 0;
          if (typeof percentCompleted === 'string') {
            completionPercent = parseFloat(percentCompleted.replace('%', ''));
          } else if (typeof percentCompleted === 'number') {
            completionPercent = percentCompleted;
          }
    
          if (completionPercent >= 80) {
            aiTrainedEmails.add(email.trim().toLowerCase());
          }
        }
      });
    
      const aiTrainingRate = (aiTrainedEmails.size / totalLearners) * 100;
      return {
        percentage: parseFloat(aiTrainingRate.toFixed(1)),
        totalLearners: totalLearners,
        aiTrained: aiTrainedEmails.size
      };
    } catch (error) {
      console.error('Error calculating AI training:', error);
      return null;
    }
  };


  const getTotalActiveEmployees = (edmData) => {
    try {
      const activeEmployees = new Set();
      edmData.forEach(row => {
        const employeeId = row['Employee ID'];
        const status = row['Status'];
        
        if (employeeId && status === 'Active') {
          activeEmployees.add(employeeId);
        }
      });
      
      return activeEmployees.size;
    } catch (error) {
      console.error('Error getting total active employees:', error);
      return 0;
    }
  };
  const calculateTalentDevelopment = (learningData) => {
    try {
      const uniqueEmails = new Set();
      const completedEmails = new Set();
  
      learningData.forEach(row => {
        const email = row['Email'];
        const target = parseFloat(row['Target']);
        const remainingHours = parseFloat(row['Remaining Hours']);
  
        if (!email || isNaN(target) || isNaN(remainingHours)) return;
  
        uniqueEmails.add(email.trim().toLowerCase());
  
        const completedHours = target - remainingHours;
        const completionPercent = (completedHours / target) * 100;
  
        if (completionPercent >= 80) {
          completedEmails.add(email.trim().toLowerCase());
        }
      });
  
      if (uniqueEmails.size === 0) return null;
  
      const talentDevelopmentRate = (completedEmails.size / uniqueEmails.size) * 100;
      return parseFloat(talentDevelopmentRate.toFixed(1));
    } catch (error) {
      console.error('Error calculating talent development:', error);
      return null;
    }
  };

  const calculateBotnosticMetrics = (employeeData, masterData) => {
    try {
      // Total People given assessment - distinct employee_id from Employee Data
      const assessmentGiven = new Set();
      employeeData.forEach(row => {
        const empId = row['employee_id'];
        if (empId) {
          assessmentGiven.add(empId);
        }
      });
      
      // People Logged In Assessment - distinct employee_code from Master Sheet
      const loggedIn = new Set();
      masterData.forEach(row => {
        const empCode = row['employee_code'];
        if (empCode) {
          loggedIn.add(empCode);
        }
      });
      
      // Total employees that started training - training_progress_percentage > 0
      const trainingStarted = masterData.filter(row => {
        const progress = parseFloat(row['training_progress_percentage']);
        return !isNaN(progress) && progress > 0;
      }).length;
      
      console.log('Botnostic metrics:', {
        assessmentGiven: assessmentGiven.size,
        loggedIn: loggedIn.size,
        trainingStarted
      });
      
      return {
        assessmentGiven: assessmentGiven.size,
        loggedIn: loggedIn.size,
        trainingStarted: trainingStarted
      };
    } catch (error) {
      console.error('Error calculating Botnostic metrics:', error);
      return null;
    }
  };
  
  const getTotalLinkedInLicenses = (learningData) => {
    try {
      if (!learningData || learningData.length === 0) {
        console.warn('No learning data provided');
        return null;
      }
      
      const uniqueEmails = new Set();
      
      // Find the email column (case-insensitive)
      const firstRow = learningData[0];
      const emailColumn = Object.keys(firstRow).find(key => 
        key.toLowerCase().includes('email')
      );
      
      if (!emailColumn) {
        console.error('No Email column found in LinkedIn Learning data');
        console.log('Available columns:', Object.keys(firstRow));
        return null;
      }
      
      console.log(`Using email column: "${emailColumn}"`);
      
      learningData.forEach(row => {
        const email = row[emailColumn];
        if (email && email.trim() !== '') {
          uniqueEmails.add(email.trim().toLowerCase());
        }
      });
      
      console.log('Total LinkedIn Learning licenses found:', uniqueEmails.size);
      return uniqueEmails.size;
    } catch (error) {
      console.error('Error calculating LinkedIn licenses:', error);
      return null;
    }
  };
  const calculateLinkedInFollowers = (data, startDate, endDate) => {
    try {
      console.log('=== FOLLOWERS DEBUG ===');
      console.log('Date range:', startDate, 'to', endDate);
      console.log('Total rows:', data.length);
      console.log('First row:', data[0]);
      console.log('Column names:', Object.keys(data[0]));
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      // Sum the "Total followers" column for the date range
      const totalFollowers = data
        .filter(row => {
          const dateStr = row['Date'];
          const rowDate = dateStr ? new Date(dateStr) : null;
          return rowDate && !isNaN(rowDate.getTime()) && rowDate >= start && rowDate <= end;
        })
        .reduce((sum, row) => {
          const followers = parseFloat(row['Total followers']) || 0;
          return sum + followers;
        }, 0);
      
      console.log('Total followers gained in range:', totalFollowers);
      return totalFollowers;
    } catch (error) {
      console.error('Error calculating LinkedIn followers:', error);
      return null;
    }
  };
  
  const calculateLinkedInPageViews = (data, startDate, endDate) => {
    try {
      console.log('=== PAGE VIEWS DEBUG ===');
      console.log('Date range:', startDate, 'to', endDate);
      console.log('Total rows:', data.length);
      console.log('First row:', data[0]);
      console.log('Column names:', Object.keys(data[0]));
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const totalViews = data
        .filter(row => {
          const dateStr = row['Date'];
          const rowDate = dateStr ? new Date(dateStr) : null;
          return rowDate && !isNaN(rowDate.getTime()) && rowDate >= start && rowDate <= end;
        })
        .reduce((sum, row) => {
          const views = parseFloat(row['Total page views (total)']) || 0;
          return sum + views;
        }, 0);
      
      console.log('Total page views calculated:', totalViews);
      return totalViews;
    } catch (error) {
      console.error('Error calculating LinkedIn page views:', error);
      return null;
    }
  };
  
  const calculateLinkedInImpressions = (data, startDate, endDate) => {
    try {
      console.log('=== IMPRESSIONS DEBUG ===');
      console.log('Date range:', startDate, 'to', endDate);
      console.log('Total rows:', data.length);
      console.log('First row:', data[0]);
      console.log('Column names:', Object.keys(data[0]));
      
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const totalImpressions = data
        .filter(row => {
          const dateStr = row['Date'];
          const rowDate = dateStr ? new Date(dateStr) : null;
          return rowDate && !isNaN(rowDate.getTime()) && rowDate >= start && rowDate <= end;
        })
        .reduce((sum, row) => {
          const impressions = parseFloat(row['Impressions (total)']) || 0;
          return sum + impressions;
        }, 0);
      
      console.log('Total impressions calculated:', totalImpressions);
      return totalImpressions;
    } catch (error) {
      console.error('Error calculating LinkedIn impressions:', error);
      return null;
    }
  };
  
  // KPI Calculation Functions
  const calculateTurnoverRate = (data, startDateStr, endDateStr) => {
    try {
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
  
      const exits = data.filter(row => {
        const exitDate = parseMaybeDate(row['Exit Date']);
        return exitDate && exitDate >= startDate && exitDate <= endDate;
      }).length;
  
      const headcountStart = data.filter(row => {
        const joiningDate = parseMaybeDate(row['Joining Date']);
        const exitDate = parseMaybeDate(row['Exit Date']);
        return joiningDate && joiningDate <= startDate &&
               (!exitDate || exitDate >= startDate);
      }).length;
  
      const headcountEnd = data.filter(row => {
        const joiningDate = parseMaybeDate(row['Joining Date']);
        const exitDate = parseMaybeDate(row['Exit Date']);
        return joiningDate && joiningDate <= endDate &&
               (!exitDate || exitDate > endDate);
      }).length;
  
      const avgHeadcount = (headcountStart + headcountEnd) / 2;
      const turnoverRate = avgHeadcount > 0 ? (exits / avgHeadcount) * 100 : 0;
  
      return parseFloat(turnoverRate.toFixed(1));
    } catch (error) {
      console.error('Error calculating turnover rate:', error);
      return null;
    }
  };

  // Add this temporary debugging function to your component:
// Add this temporary function to help debug:
  const debugTimeToFillDetailed = (data) => {
    console.log('=== DETAILED TIME TO FILL DEBUG ===');
    
    const today = new Date();
    const startDate = new Date('2025-07-01');
    
    console.log('Total rows:', data.length);
    console.log('Date range: July 1, 2025 to', today.toISOString());
    
    const step1Results = [];
    
    data.forEach((row, idx) => {
      const erfDate = parseMaybeDate(row['ERF Received On']);
      const joiningDate = parseMaybeDate(row['Joining Date']);
      const status = row['Status'];
      const timeToFillRaw = row['Time To Fill'];
      
      // Step 1: Calculate Time to Fill (2) - your first step
      let timeToFill2;
      if (erfDate && joiningDate && status === 'Hired') {
        const ttfRaw = parseFloat(timeToFillRaw);
        if (isNaN(ttfRaw) || ttfRaw < 0) {
          timeToFill2 = 0;
        } else {
          timeToFill2 = ttfRaw;
        }
      } else {
        timeToFill2 = 'Not Hired';
      }
      
      // Step 2: Check if ERF is in range for averaging
      const inRange = erfDate && erfDate >= startDate && erfDate <= today;
      
      if (typeof timeToFill2 === 'number' && inRange) {
        step1Results.push({
          row: idx + 2, // Excel row number
          erfDate: erfDate?.toISOString?.().split('T')[0],
          joiningDate: joiningDate?.toISOString?.().split('T')[0],
          status,
          timeToFillOriginal: timeToFillRaw,
          timeToFill2: timeToFill2
        });
      }
    });
    
    console.log('Records matching criteria (ERF >= July 1, 2025, Hired, TTF >= 0):', step1Results.length);
    console.log('Sample records:', step1Results.slice(0, 10));
    
    const validValues = step1Results.map(r => r.timeToFill2).filter(v => v >= 0);
    const sum = validValues.reduce((a, b) => a + b, 0);
    const average = validValues.length > 0 ? sum / validValues.length : 0;
    
    console.log('Valid TTF values:', validValues);
    console.log('Sum:', sum);
    console.log('Count:', validValues.length);
    console.log('Average:', average.toFixed(1));
    
    return average;
  };
    
  const calculateTimeToFill = (data, startDateStr, endDateStr) => {
    try {
      const startDate = new Date(startDateStr);
      const endDate = new Date(endDateStr);
  
      const step1Results = [];
      
      data.forEach((row) => {
        const erfDate = parseMaybeDate(row['ERF Received On']);
        const joiningDate = parseMaybeDate(row['Joining Date']);
        const status = row['Status'];
        const timeToFillRaw = row['Time To Fill'];
        
        // Step 1: Calculate Time to Fill (2) - match Excel logic
        let timeToFill2;
        if (erfDate && joiningDate && status === 'Hired') {
          const ttfRaw = parseFloat(timeToFillRaw);
          if (isNaN(ttfRaw) || ttfRaw < 0) {
            timeToFill2 = 0;
          } else {
            timeToFill2 = ttfRaw;
          }
        } else {
          timeToFill2 = null; // Not hired
        }
        
        // Step 2: Check if ERF is in range for averaging
        const inRange = erfDate && erfDate >= startDate && erfDate <= endDate;
        
        if (typeof timeToFill2 === 'number' && inRange && timeToFill2 >= 0) {
          step1Results.push(timeToFill2);
        }
      });
      
      if (step1Results.length === 0) return null;
  
      const average = step1Results.reduce((sum, val) => sum + val, 0) / step1Results.length;
      return parseFloat(average.toFixed(1));
    } catch (error) {
      console.error('Error calculating time to fill:', error);
      return null;
    }
  };

  const calculateEngagementScore = (data) => {
    try {
      const enpsColumn = 'How likely are you to recommend JBS to a friend or colleague?';
      const cultureColumn = 'How would you rate the company culture?';

      let promoters = 0, passives = 0, detractors = 0;

      data.forEach(row => {
        const score = parseFloat(row[enpsColumn]);
        if (!isNaN(score)) {
          if (score >= 9) promoters++;
          else if (score >= 7) passives++;
          else detractors++;
        }
      });

      const totalResponses = promoters + passives + detractors;
      if (totalResponses === 0) return null;

      const enps = ((promoters / totalResponses) - (detractors / totalResponses)) * 100;
      // Keep the previous behavior but it's safe to compute without causing runtime errors
      const enpsPercentage = (enps + 100) / 2;

      const cultureScores = data
        .map(row => {
          const rating = parseFloat(row[cultureColumn]);
          return isNaN(rating) ? null : (rating / 10) * 100;
        })
        .filter(score => score !== null);

      if (cultureScores.length === 0) return null;

      const avgCultureScore = cultureScores.reduce((sum, score) => sum + score, 0) / cultureScores.length;
      const engagementScore = (enpsPercentage * 0.5) + (avgCultureScore * 0.5);

      return parseFloat(engagementScore.toFixed(1));
    } catch (error) {
      console.error('Error calculating engagement score:', error);
      return null;
    }
  };

  const calculateDiversityIndex = (data) => {
    try {
      const activeEmployees = data.filter(row => row['Status'] === 'Active');
      const totalEmployees = activeEmployees.length;
      if (totalEmployees === 0) return null;

      const calculateDiversity = (counts) => {
        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        if (total === 0) return 0;

        const proportions = Object.values(counts).map(count => count / total);
        const sumOfSquares = proportions.reduce((sum, p) => sum + (p * p), 0);
        return 1 - sumOfSquares;
      };

      const genderCounts = { Male: 0.9, Female: 0.1 };
      const genderDiversity = calculateDiversity(genderCounts);

      const ageCounts = { 'under30': 0, '30to50': 0, 'over50': 0 };
      activeEmployees.forEach(row => {
        const age = parseFloat(row["Employee's Age"]);
        if (!isNaN(age)) {
          if (age < 30) ageCounts.under30++;
          else if (age <= 50) ageCounts['30to50']++;
          else ageCounts.over50++;
        }
      });
      const ageDiversity = calculateDiversity(ageCounts);

      const religionCounts = {};
      activeEmployees.forEach(row => {
        const religion = row['Religion'];
        if (religion) {
          religionCounts[religion] = (religionCounts[religion] || 0) + 1;
        }
      });
      const religionDiversity = calculateDiversity(religionCounts);

      const diversityIndex = ((genderDiversity + ageDiversity + religionDiversity) / 3) * 100;
      
      // Calculate percentages for display
      const totalAge = ageCounts.under30 + ageCounts['30to50'] + ageCounts.over50;
      const agePercentages = {
        'Under 30': ((ageCounts.under30 / totalAge) * 100).toFixed(1),
        '30-50': ((ageCounts['30to50'] / totalAge) * 100).toFixed(1),
        'Over 50': ((ageCounts.over50 / totalAge) * 100).toFixed(1)
      };
      
      const totalReligion = Object.values(religionCounts).reduce((sum, count) => sum + count, 0);
      const religionPercentages = {};
      Object.entries(religionCounts).forEach(([religion, count]) => {
        religionPercentages[religion] = ((count / totalReligion) * 100).toFixed(1);
      });
      
      return {
        index: parseFloat(diversityIndex.toFixed(1)),
        breakdowns: {
          gender: { Male: '90.0', Female: '10.0' }, // Static approximate values
          age: agePercentages,
          religion: religionPercentages
        }
      };
   
    } catch (error) {
      console.error('Error calculating diversity index:', error);
      return null;
    }
  };

  const calculateEDMCharts = (data) => {
    try {
      // Filter only ACTIVE employees first
      const activeEmployees = data.filter(row => {
        const status = row['Status'];
        return status && status.trim().toLowerCase() === 'active';
      });
  
      console.log('Total records in EDM:', data.length);
      console.log('Active employees only:', activeEmployees.length);
  
      // Chart 1: Employees by Company (ONLY ACTIVE)
      const companyCounts = {};
      activeEmployees.forEach(row => {
        const company = row['Company'];
        if (company && company.trim() !== '') {
          companyCounts[company.trim()] = (companyCounts[company.trim()] || 0) + 1;
        }
      });
  
      const companyData = Object.entries(companyCounts)
        .map(([name, count]) => ({  
          name: getCompanyShortName(name), 
          value: count 
        }))
        .sort((a, b) => b.value - a.value);
  
      // Chart 2: Employees by Type (ONLY ACTIVE - Contract, Probationary, Permanent)
      const typeCounts = { Contract: 0, Probationary: 0, Permanent: 0 };
      activeEmployees.forEach(row => {
        const type = row['Type'];
        if (type && type.trim() !== '') {
          const cleanType = type.trim().toLowerCase();
          if (cleanType === 'contract') {
            typeCounts.Contract++;
          } else if (cleanType === 'probationary') {
            typeCounts.Probationary++;
          } else {
            typeCounts.Permanent++;
          }
        }
      });
  
      const typeData = Object.entries(typeCounts)
        .filter(([_, count]) => count > 0)
        .map(([name, value]) => ({ name, value }));
  
      console.log('Company distribution:', companyData);
      console.log('Type distribution:', typeData);
  
      return { company: companyData, type: typeData };
    } catch (error) {
      console.error('Error calculating EDM charts:', error);
      return { company: [], type: [] };
    }
  };

  const getCompanyShortName = (companyName) => {
    const shortNameMap = {
      'Jaffer Business Systems (Private) Limited': 'JBSPL',
      'Energy and Automation Pakistan (Private) Limited': 'ENA',
      'Jaffer Business Systems Inc.': 'JBSInc',
      'Impare Tech (Private) Limited': 'Impare',
      'Hysab Kytab (Private) Limited': 'HK'
    };
    
    return shortNameMap[companyName] || companyName;
  };
  
const handleFileUpload = async (fileType, file) => {
  if (!file) {
    console.log('No file provided');
    return;
  }

  console.log('=== FILE UPLOAD START ===');
  console.log('File type:', fileType);
  console.log('File name:', file.name);
  console.log('File size:', file.size);

  try {
    let sheetName = null;
    if (fileType === 'linkedinFollowers') {
      sheetName = 'New followers';
    } else if (fileType === 'linkedinVisitors') {
      sheetName = 'Visitor metrics';
    } else if (fileType === 'linkedinContent') {
      sheetName = 'Metrics';
    } else if (fileType === 'linkedinLearning') {
      sheetName = 'LinkedIn Learner Summary';
    }

const jsonData = await parseExcelFile(file, sheetName);
    
    setUploadedFiles(prev => ({ ...prev, [fileType]: jsonData }));

    let newCalculations = { ...calculatedKPIs };

    if (fileType === 'edmReport') {
      console.log('Calculating turnover and diversity...');
      const turnoverRate = calculateTurnoverRate(jsonData, turnoverDateRange.startDate, turnoverDateRange.endDate);
      const diversityIndex = calculateDiversityIndex(jsonData);
      const totalActiveEmployees = getTotalActiveEmployees(jsonData);
      const chartData = calculateEDMCharts(jsonData);

      setEdmChartData(chartData);
      console.log('Turnover:', turnoverRate, 'Diversity:', diversityIndex, 'Active Employees:', totalActiveEmployees);
    
      if (turnoverRate !== null) newCalculations.turnoverRate = turnoverRate;
      if (diversityIndex !== null) {
        newCalculations.diversityIndex = diversityIndex.index;
        newCalculations.diversityBreakdowns = diversityIndex.breakdowns;
      }
      newCalculations.totalActiveEmployees = totalActiveEmployees;
    
      // Update AI Training stats if LinkedIn Learner Detail is already uploaded
      if (uploadedFiles.linkedinLearnerDetail && calculatedKPIs.aiTraining) {
        newCalculations.aiTraining = {
          ...calculatedKPIs.aiTraining,
          totalActiveEmployees: totalActiveEmployees
        };
      }
    } else if (fileType === 'recruitmentTracker') {
      console.log('Calculating time to fill...');
      const timeToFill = calculateTimeToFill(jsonData, timeToFillDateRange.startDate, timeToFillDateRange.endDate);
      console.log('Time to fill:', timeToFill);
      
      if (timeToFill !== null) newCalculations.timeToFill = timeToFill;
    } else if (fileType === 'enpsSurvey') {
      console.log('Calculating engagement score...');
      const engagementScore = calculateEngagementScore(jsonData);
      console.log('Engagement score:', engagementScore);
      
      if (engagementScore !== null) newCalculations.engagementScore = engagementScore;
    } else if (fileType === 'linkedinLearnerDetail') {
      console.log('Calculating AI training...');
      
      // Check if we have LinkedIn Learning total licenses already
      const totalLicenses = calculatedKPIs.totalLinkedInLicenses || null;
      
      const aiTraining = calculateAITraining(jsonData, totalLicenses);
      console.log('AI training:', aiTraining);
      
      if (aiTraining !== null) {
        newCalculations.aiTraining = aiTraining;
        
        // If EDM is already uploaded, add total active employees
        if (uploadedFiles.edmReport) {
          newCalculations.totalActiveEmployees = getTotalActiveEmployees(uploadedFiles.edmReport);
        }
      }
    } else if (fileType === 'linkedinLearning') {
      console.log('Calculating talent development...');
      const talentDevelopment = calculateTalentDevelopment(jsonData);
      console.log('Talent development:', talentDevelopment);
      
      if (talentDevelopment !== null) newCalculations.talentDevelopment = talentDevelopment;
      
      // Calculate total LinkedIn Learning licenses
      const totalLicenses = getTotalLinkedInLicenses(jsonData);
      console.log('Total LinkedIn Learning licenses:', totalLicenses);
      
      if (totalLicenses !== null) {
        newCalculations.totalLinkedInLicenses = totalLicenses;
        
        // Recalculate AI Training if Learner Detail already uploaded
        if (uploadedFiles.linkedinLearnerDetail) {
          console.log('Recalculating AI training with correct total licenses...');
          const aiTraining = calculateAITraining(uploadedFiles.linkedinLearnerDetail, totalLicenses);
          console.log('Updated AI training:', aiTraining);
          
          if (aiTraining !== null) {
            newCalculations.aiTraining = aiTraining;
          }
        }
      }
    } else if (fileType === 'linkedinFollowers') {
      console.log('Processing LinkedIn Followers data...');
      const followers = calculateLinkedInFollowers(jsonData, dateRange.startDate, dateRange.endDate);
      console.log('LinkedIn followers:', followers);
      
      if (followers !== null) {
        newCalculations.linkedinEngagement = {
          ...(newCalculations.linkedinEngagement || {}),
          followers: followers
        };
      }
    } else if (fileType === 'linkedinVisitors') {
      console.log('Processing LinkedIn Visitors data...');
      const pageViews = calculateLinkedInPageViews(jsonData, dateRange.startDate, dateRange.endDate);
      console.log('LinkedIn page views:', pageViews);
      
      if (pageViews !== null) {
        newCalculations.linkedinEngagement = {
          ...(newCalculations.linkedinEngagement || {}),
          pageViews: pageViews
        };
      }
    } else if (fileType === 'linkedinContent') {
      console.log('Processing LinkedIn Content data...');
      const impressions = calculateLinkedInImpressions(jsonData, dateRange.startDate, dateRange.endDate);
      console.log('LinkedIn impressions:', impressions);
      
      if (impressions !== null) {
        newCalculations.linkedinEngagement = {
          ...(newCalculations.linkedinEngagement || {}),
          impressions: impressions
        };
      }   
    } else if (fileType === 'talentxData') {
      console.log('Processing TalentX Data...');
      
      // Parse both sheets
      const employeeDataSheet = await parseExcelFile(file, 'Employee data', fileType);
      const masterSheet = await parseExcelFile(file, 'TalentX - Master Sheet', fileType);
      
      console.log('Employee Data rows:', employeeDataSheet.length);
      console.log('Master Sheet rows:', masterSheet.length);
      
      const botnosticMetrics = calculateBotnosticMetrics(employeeDataSheet, masterSheet);
      console.log('Botnostic metrics:', botnosticMetrics);
      
      if (botnosticMetrics !== null) {
        newCalculations.botnosticSolutions = botnosticMetrics;
      }
    }
    await saveUploadedFile(fileType, file.name, jsonData.length);
    
    // Save all calculated KPIs
    for (const [key, value] of Object.entries(newCalculations)) {
      // Check if this is a complex object that should go in metadata
      if (key === 'diversityBreakdowns' || key === 'aiTraining' || key === 'linkedinEngagement') {
        await saveCalculatedKPI(key, null, value);
      } 
      // Simple numeric values
      else if (typeof value === 'number') {
        await saveCalculatedKPI(key, value, null);
      }
      // Handle any other cases
      else if (typeof value === 'object' && value !== null) {
        await saveCalculatedKPI(key, null, value);
      } else {
        await saveCalculatedKPI(key, value, null);
      }
    }
    
    // Save EDM chart data if updated
    if (fileType === 'edmReport') {
      const currentChartData = calculateEDMCharts(jsonData);
      if (currentChartData.company.length > 0) {
        await saveEDMChartData(currentChartData.company, currentChartData.type);
      }
    }

    setCalculatedKPIs(newCalculations);
    setUploadStatus(prev => ({ ...prev, [fileType]: 'success' }));
    console.log('=== FILE UPLOAD SUCCESS ===');

    setTimeout(() => {
      setUploadStatus(prev => ({ ...prev, [fileType]: null }));
    }, 3000);

  } catch (error) {
    console.error('=== FILE UPLOAD FAILED ===');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    setUploadStatus(prev => ({ ...prev, [fileType]: 'error' }));
  }
};
  
  const pillarColors = {
    'Talent Acquisition': '#3498DB',
    'Talent Management': '#9B59B6',
    'Learning': '#E67E22',
    'Employer Branding': '#E91E63'
  };

  const pillarIcons = {
    'Talent Acquisition': Users,
    'Talent Management': Briefcase,
    'Learning': BookOpen,
    'Employer Branding': ThumbsUp
  };

  const filteredData = selectedPillar === 'all'
    ? kpiData
    : kpiData.filter(item => item.companyPillar === selectedPillar);

  const pillarSummary = Object.keys(pillarColors).map(pillar => {
    const items = kpiData.filter(item => item.companyPillar === pillar);
    const kpiCount = items.length;
    const sumAbsTargets = items.reduce((acc, item) => acc + (Math.abs(item.targetValue) || 0), 0);
    const avgTarget = kpiCount > 0 ? Math.round(sumAbsTargets / kpiCount) : 0;
    return { name: pillar, kpiCount, avgTarget };
  });

  const hrPillarData = [
    { name: 'P&C Organization', value: kpiData.filter(k => k.hrPillar === 'P&C Organization').length },
    { name: 'Talent & Skills', value: kpiData.filter(k => k.hrPillar === 'Talent & Skills').length },
    { name: 'Leadership & Culture', value: kpiData.filter(k => k.hrPillar === 'Leadership & Culture').length }
  ];

  const COLORS = ['#3498DB', '#9B59B6', '#E74C3C'];

  const handleKPIClick = (kpi) => {
    setSelectedKPI(kpi);
    setShowModal(true);
  };

  const KPICard = ({ kpi, index }) => {
    // Special handling for LinkedIn Page Engagement KPI
    const isLinkedInKPI = kpi.kpi === 'LinkedIn Page Engagement';
    const isAIProcessesKPI = kpi.kpi === 'AI-Driven P&C Processes';
    const isBotnosticKPI = kpi.kpi === 'Botnostic Solutions - Talent Management';
    
    if (isLinkedInKPI) {
      const followers = calculatedKPIs.linkedinEngagement?.followers || 0;
      const pageViews = calculatedKPIs.linkedinEngagement?.pageViews || 0;
      const impressions = calculatedKPIs.linkedinEngagement?.impressions || 0;
      
      return (
        <div
          key={index}
          onClick={() => handleKPIClick(kpi)}
          className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer border-t-4 transform hover:-translate-y-1"
          style={{
            borderTopColor: pillarColors[kpi.companyPillar],
            minHeight: '380px' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="text-3xl mb-2">{kpi.icon}</div>
              <h3 className="font-bold text-slate-800 text-lg mb-1">{kpi.kpi}</h3>
              <p className="text-sm text-slate-500 mb-2">{kpi.hrPillar}</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {kpi.status}
            </span>
          </div>
  
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm font-medium text-slate-700 mb-2">2025 Target:</p>
              <p className="text-sm text-slate-600">{kpi.target}</p>
            </div>
  
            {/* Followers Progress Bar */}
            <div className="pt-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">👥 Total Followers:</span>
                <span className="font-bold text-slate-800">{followers.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all bg-blue-500"
                  style={{ width: `${Math.min((followers / 2554) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Target: 20% growth</p>
            </div>
  
            {/* Page Views Progress Bar */}
            <div className="pt-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">👁️ Total Page Views:</span>
                <span className="font-bold text-slate-800">{pageViews.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all bg-purple-500"
                  style={{ width: `${Math.min((pageViews / 5000) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Target: 5,000 views</p>
            </div>
  
            {/* Impressions Progress Bar */}
            <div className="pt-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-600">📊 Total Impressions:</span>
                <span className="font-bold text-slate-800">{impressions.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all bg-pink-500"
                  style={{ width: `${Math.min((impressions / 10000) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Target: 10,000 impressions</p>
            </div>
          </div>
  
          {kpi.calculable && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-600 font-medium">
              <RefreshCw className="w-3 h-3" />
              Auto-calculated from data
            </div>
          )}
        </div>
      );
    }

    if (isAIProcessesKPI) {
        const aiTools = kpi.details.aiTools || [];
        
        return (
          <div
            key={index}
            onClick={() => handleKPIClick(kpi)}
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer border-t-4 transform hover:-translate-y-1 h-full"
            style={{ borderTopColor: pillarColors[kpi.companyPillar] }}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="text-3xl mb-2">{kpi.icon}</div>
                <h3 className="font-bold text-slate-800 text-lg mb-1">{kpi.kpi}</h3>
                <p className="text-sm text-slate-500 mb-2">{kpi.hrPillar}</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {kpi.status}
              </span>
            </div>
    
            <div className="space-y-3">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-sm font-medium text-slate-700 mb-2">2025 Target:</p>
                <p className="text-sm text-slate-600">{kpi.target}</p>
              </div>
    
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-4 border border-purple-200">
                <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide mb-3">
                  Active AI Solutions
                </p>
                <div className="space-y-2">
                  {aiTools.map((tool, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-purple-100 last:border-0">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{tool.name}</p>
                        <p className="text-xs text-slate-500">{tool.category}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        tool.status === 'Operational' ? 'bg-green-100 text-green-700' :
                        tool.status === 'Achieved' ? 'bg-blue-100 text-blue-700' :
                        tool.status === 'In Implementation' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {tool.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              <p className="text-xs text-center text-slate-500 italic mt-3">
                Click to view detailed achievements for each solution
              </p>
            </div>
          </div>
        );
      }    
    if (isBotnosticKPI) {
      const assessmentGiven = calculatedKPIs.botnosticSolutions?.assessmentGiven || 0;
      const loggedIn = calculatedKPIs.botnosticSolutions?.loggedIn || 0;
      const trainingStarted = calculatedKPIs.botnosticSolutions?.trainingStarted || 0;
      
      return (
        <div
          key={index}
          onClick={() => handleKPIClick(kpi)}
          className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer border-t-4 transform hover:-translate-y-1"
          style={{ borderTopColor: pillarColors[kpi.companyPillar], minHeight: '380px' }}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="text-3xl mb-2">{kpi.icon}</div>
              <h3 className="font-bold text-slate-800 text-lg mb-1">{kpi.kpi}</h3>
              <p className="text-sm text-slate-500 mb-2">{kpi.hrPillar}</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              {kpi.status}
            </span>
          </div>
    
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-sm font-medium text-slate-700 mb-2">Platform Metrics:</p>
              <p className="text-sm text-slate-600">{kpi.target}</p>
            </div>
    
            {/* Assessment Given */}
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">📋 Total Assessments Given:</span>
                <span className="font-bold text-blue-700">{assessmentGiven}</span>
              </div>
            </div>
    
            {/* Logged In */}
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">👤 People Logged In:</span>
                <span className="font-bold text-green-700">{loggedIn}</span>
              </div>
            </div>
    
            {/* Training Started */}
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-700">🎓 Training Started:</span>
                <span className="font-bold text-purple-700">{trainingStarted}</span>
              </div>
            </div>
          </div>
    
          {kpi.calculable && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-600 font-medium">
              <RefreshCw className="w-3 h-3" />
              Auto-calculated from TalentX data
            </div>
          )}
        </div>
      );
    }  
    // Regular KPI card for all other KPIs
    const safeCurrent = kpi.currentValue != null ? Number(kpi.currentValue) : null;
    const safeTarget = kpi.targetValue != null ? Number(kpi.targetValue) : null;
    const progressPct = safeTarget && safeTarget !== 0 && safeCurrent !== null
      ? Math.min((Math.abs(safeCurrent) / Math.abs(safeTarget)) * 100, 100)
      : 0;
  
    return (
      <div
        key={index}
        onClick={() => handleKPIClick(kpi)}
        className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer border-t-4 transform hover:-translate-y-1"
        style={{ borderTopColor: pillarColors[kpi.companyPillar] }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="text-3xl mb-2">{kpi.icon}</div>
            <h3 className="font-bold text-slate-800 text-lg mb-1">{kpi.kpi}</h3>
            <p className="text-sm text-slate-500 mb-2">{kpi.hrPillar}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              kpi.status === 'Start Tracking'
                ? 'bg-yellow-100 text-yellow-800'
                : kpi.status === 'Planning'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            {kpi.status}
          </span>
        </div>
  
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm font-medium text-slate-700 mb-2">2025 Target:</p>
            <p className="text-sm text-slate-600">{kpi.target}</p>
          </div>
  
          <div className="pt-2">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-600">Current Progress:</span>
              <span className="font-bold text-slate-800">{safeCurrent !== null ? `${safeCurrent}%` : 'N/A'}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: pillarColors[kpi.companyPillar]
                }}
              />
            </div>
          </div>
        </div>
  
        {kpi.calculable && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-green-600 font-medium">
            <RefreshCw className="w-3 h-3" />
            Auto-calculated from data
          </div>
        )}
      </div>
    );
  };
  const FileUploadSection = ({ fileType, label, description }) => {
    const status = uploadStatus[fileType];
    const hasFile = uploadedFiles[fileType] !== null;

    return (
      <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 p-6 hover:border-blue-400 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-slate-800 mb-1">{label}</h3>
            <p className="text-sm text-slate-600">{description}</p>
          </div>
          {hasFile && (
            <CheckCircle className="w-6 h-6 text-green-500" />
          )}
        </div>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handleFileUpload(fileType, e.target.files[0])}
          className="hidden"
          id={`upload-${fileType}`}
        />

        <label
          htmlFor={`upload-${fileType}`}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium cursor-pointer transition-all ${
            status === 'processing'
              ? 'bg-blue-100 text-blue-700'
              : status === 'success'
              ? 'bg-green-100 text-green-700'
              : status === 'error'
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {status === 'processing' ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : status === 'success' ? (
            <>
              <CheckCircle className="w-5 h-5" />
              Uploaded Successfully
            </>
          ) : status === 'error' ? (
            <>
              <AlertCircle className="w-5 h-5" />
              Upload Failed
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              {hasFile ? 'Replace File' : 'Upload File'}
            </>
          )}
        </label>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 mb-2">
                HR Strategic KPI Dashboard
              </h1>
              <p className="text-slate-600">
                Track and monitor strategic HR objectives aligned with company goals
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowUploadModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Upload className="w-5 h-5" />
                Upload Data
              </button>
            <button
              onClick={async () => {
                if (window.confirm('Are you sure you want to reset all data? This cannot be undone.')) {
                  await clearAllUserData();
                  window.location.reload();
                }
              }}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Reset Data
            </button>
              </div>
          </div>
        </div>

        {/* Pillar Filter */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedPillar('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                selectedPillar === 'all'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Pillars
            </button>
            {Object.keys(pillarColors).map(pillar => {
              const Icon = pillarIcons[pillar];
              return (
                <button
                  key={pillar}
                  onClick={() => setSelectedPillar(pillar)}
                  className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    selectedPillar === pillar
                      ? 'text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  style={selectedPillar === pillar ? { backgroundColor: pillarColors[pillar] } : {}}
                >
                  <Icon className="w-4 h-4" />
                  {pillar}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary Charts from EDM Report */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Chart 1: Employees by Company */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Total Employees by Company</h2>
            {edmChartData.company.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={edmChartData.company}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-15} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3498DB" name="Employee Count" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">
                Upload EDM Report to view employee distribution by company
              </div>
            )}
          </div>
        
          {/* Chart 2: Employees by Type */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Employee Distribution by Type</h2>
            {edmChartData.type.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={edmChartData.type}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {edmChartData.type.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">
                Upload EDM Report to view employee distribution by type
              </div>
            )}
          </div>
        </div>
        {/* KPI Cards */}
        <div>
          {selectedPillar === 'all' ? (
            Object.keys(pillarColors).map((pillar) => {
              const pillarKPIs = kpiData.filter(item => item.companyPillar === pillar);
              const Icon = pillarIcons[pillar];
              return (
                <div key={pillar} className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: pillarColors[pillar] + '20' }}
                    >
                      <Icon className="w-6 h-6" style={{ color: pillarColors[pillar] }} />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">{pillar}</h2>
                    <span className="text-sm text-slate-500">({pillarKPIs.length} KPIs)</span>
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pillarKPIs.map((kpi, index) => (
                      <KPICard key={index} kpi={kpi} index={index} />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: pillarColors[selectedPillar] + '20' }}
                >
                  {React.createElement(pillarIcons[selectedPillar], {
                    className: "w-6 h-6",
                    style: { color: pillarColors[selectedPillar] }
                  })}
                </div>
                <h2 className="text-2xl font-bold text-slate-800">{selectedPillar}</h2>
                <span className="text-sm text-slate-500">({filteredData.length} KPIs)</span>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredData.map((kpi, index) => (
                  <KPICard key={index} kpi={kpi} index={index} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2027 Goals & Objectives - ADD THIS ENTIRE BLOCK */}
        <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-xl shadow-lg p-8 mt-8 text-white">
          <h2 className="text-3xl font-bold mb-2">2027 Strategic Objectives & Goals</h2>
          <p className="text-slate-300 mb-6">Long-term HR initiatives aligned with organizational vision</p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Talent Acquisition Goals */}
            <div className="bg-white bg-opacity-10 rounded-lg p-5 border border-blue-400 border-opacity-30">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-blue-300" />
                <h3 className="font-bold text-lg">Talent Acquisition</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-100">
                <li className="flex gap-2">
                  <span className="text-blue-300 font-bold">→</span>
                  <span>20% of hires meeting or exceeding performance expectations within the first year</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-300 font-bold">→</span>
                  <span>Reduce turnover rate by 5%</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-300 font-bold">→</span>
                  <span>Reduce average time to fill critical positions by 5%</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-300 font-bold">→</span>
                  <span>Ensure an average of 10% workplace diversity (age, gender, minority groups)</span>
                </li>
              </ul>
            </div>

            {/* Talent Management Goals */}
            <div className="bg-white bg-opacity-10 rounded-lg p-5 border border-purple-400 border-opacity-30">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-5 h-5 text-purple-300" />
                <h3 className="font-bold text-lg">Talent Management</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-100">
                <li className="flex gap-2">
                  <span className="text-purple-300 font-bold">→</span>
                  <span>Increase Employee Development Index by 5% (from baseline)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-300 font-bold">→</span>
                  <span>Implement AI in 25% of P&C processes, enhancing decision making and efficiency</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-300 font-bold">→</span>
                  <span>Achieve an employee engagement score of at least 20%</span>
                </li>
              </ul>
            </div>

            {/* Learning & Development Goals */}
            <div className="bg-white bg-opacity-10 rounded-lg p-5 border border-orange-400 border-opacity-30">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-5 h-5 text-orange-300" />
                <h3 className="font-bold text-lg">Learning & Development</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-100">
                <li className="flex gap-2">
                  <span className="text-orange-300 font-bold">→</span>
                  <span>35% of permanent employees trained and proficient in AI-driven tools and processes</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-300 font-bold">→</span>
                  <span>60% completion rate of skill development based on Training Needs Analysis</span>
                </li>
              </ul>
            </div>
          
            {/* Employer Branding Goals */}
            <div className="bg-white bg-opacity-10 rounded-lg p-5 border border-pink-400 border-opacity-30">
              <div className="flex items-center gap-2 mb-3">
                <ThumbsUp className="w-5 h-5 text-pink-300" />
                <h3 className="font-bold text-lg">Employer Branding</h3>
              </div>
              <ul className="space-y-2 text-sm text-slate-100">
                <li className="flex gap-2">
                  <span className="text-pink-300 font-bold">→</span>
                  <span>Increase LinkedIn followers by 20% through strategic content and engagement</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-pink-300 font-bold">→</span>
                  <span>Achieve 5,000 total page views to enhance employer brand visibility</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-pink-300 font-bold">→</span>
                  <span>Reach 10,000 total impressions showcasing company culture and opportunities</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-500 bg-opacity-20 rounded-lg border border-blue-400 border-opacity-50">
            <p className="text-sm text-slate-200">
              <span className="font-bold">Timeline:</span> These strategic objectives are planned for achievement by 2027, with quarterly reviews and monthly tracking to ensure progress alignment.
            </p>
          </div>
        </div>
        {/* END OF 2027 Goals Section */}
        
        {/* Implementation Guide */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Implementation Roadmap</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-bold text-blue-900 mb-2">Q1 2025: Foundation</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Establish baseline metrics</li>
                <li>• Set up tracking systems</li>
                <li>• Launch "Start Tracking" KPIs</li>
                <li>• Train stakeholders</li>
              </ul>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="font-bold text-green-900 mb-2">Q2-Q3 2025: Execution</h3>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• Implement initiatives</li>
                <li>• Monitor progress monthly</li>
                <li>• Adjust strategies as needed</li>
                <li>• Report to leadership</li>
              </ul>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <h3 className="font-bold text-purple-900 mb-2">Q4 2025: Review</h3>
              <ul className="text-sm text-purple-800 space-y-1">
                <li>• Evaluate performance</li>
                <li>• Identify gaps</li>
                <li>• Plan for 2026</li>
                <li>• Celebrate successes</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Upload Data Files</h2>
                  <p className="text-sm text-slate-600 mt-1">Upload Excel files to automatically calculate KPIs</p>
                </div>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Date Range Selector for LinkedIn Reports */}
                <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-lg p-5 border-2 border-pink-300">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    📅 Date Range for LinkedIn Analytics
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Select the date range for calculating LinkedIn page metrics (followers, page views, impressions)
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => updateDateRange({ ...dateRange, startDate: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => updateDateRange({ ...dateRange, endDate: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    💡 Current selection: {new Date(dateRange.startDate).toLocaleDateString()} to {new Date(dateRange.endDate).toLocaleDateString()}
                  </p>
                </div>
                            {/* Date Range for Turnover Rate */}
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg p-5 border-2 border-blue-300">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    📉 Date Range for Turnover Rate
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Select the date range for calculating employee turnover rate
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={turnoverDateRange.startDate}
                        onChange={(e) => updateTurnoverDateRange({ ...turnoverDateRange, startDate: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={turnoverDateRange.endDate}
                        onChange={(e) => setTurnoverDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    💡 Current selection: {new Date(turnoverDateRange.startDate).toLocaleDateString()} to {new Date(turnoverDateRange.endDate).toLocaleDateString()}
                  </p>
                </div>

                {/* Date Range for Time to Fill */}
                <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg p-5 border-2 border-orange-300">
                  <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    ⏱️ Date Range for Time to Fill
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Select the date range for calculating average time to fill positions
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={timeToFillDateRange.startDate}
                        onChange={(e) => updateTimeToFillDateRange({ ...timeToFillDateRange, startDate: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={timeToFillDateRange.endDate}
                        onChange={(e) => updateTimeToFillDateRange({ ...timeToFillDateRange, endDate: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    💡 Current selection: {new Date(timeToFillDateRange.startDate).toLocaleDateString()} to {new Date(timeToFillDateRange.endDate).toLocaleDateString()}
                  </p>
                </div>
                
                <FileUploadSection
                  fileType="edmReport"
                  label="EDM Report"
                  description="Employee Data Management report containing joining dates, exit dates, demographics"
                />

                <FileUploadSection
                  fileType="recruitmentTracker"
                  label="Recruitment Tracker"
                  description="Recruitment data with ERF dates, joining dates, and time to fill metrics"
                />

                <FileUploadSection
                  fileType="enpsSurvey"
                  label="eNPS & cNPS Survey"
                  description="Employee Net Promoter Score and company culture survey responses"
                />
                <FileUploadSection
                  fileType="talentxData"
                  label="TalentX Data (Botnostic)"
                  description="Talent management data with employee assessments and training progress from Master Sheet and Employee Data"
                />
                 <FileUploadSection
                  fileType="linkedinLearnerDetail"
                  label="LinkedIn Learner Detail Report"
                  description="Individual learner data with email, percent completed, and skills for AI training tracking"
                />
              
                <FileUploadSection
                  fileType="linkedinLearning"
                  label="LinkedIn Learning Report"
                  description="Learning progress data with email, target hours, and remaining hours for talent development"
                />
                <div className="border-t-2 border-slate-300 my-4"></div>
                
                <div className="bg-pink-50 rounded-lg p-4 border border-pink-200 mb-4">
                  <h3 className="font-semibold text-pink-900 mb-2">📱 LinkedIn Page Analytics</h3>
                  <p className="text-sm text-pink-800">Upload all three reports to track employer branding performance</p>
                </div>
                
                <FileUploadSection
                  fileType="linkedinFollowers"
                  label="LinkedIn Followers Report"
                  description="People and Culture page followers data with date and total followers"
                />
                
                <FileUploadSection
                  fileType="linkedinVisitors"
                  label="LinkedIn Visitors Report"
                  description="Page visitor analytics with total page views across all sections"
                />
                
                <FileUploadSection
                  fileType="linkedinContent"
                  label="LinkedIn Content Report"
                  description="Content performance data with impressions, clicks, reactions, and engagement"
                />
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-2">📊 Auto-Calculated KPIs</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• <strong>Turnover Rate</strong> - Calculated from EDM Report</li>
                    <li>• <strong>Time to Fill</strong> - Calculated from Recruitment Tracker</li>
                    <li>• <strong>Employee Engagement Score</strong> - Calculated from eNPS Survey</li>
                    <li>• <strong>Diversity Index</strong> - Calculated from EDM Report</li>
                    <li>• <strong>AI Training</strong> - Calculated from LinkedIn Learner Detail</li>
                    <li>• <strong>Talent Development</strong> - Calculated from LinkedIn Learning Report</li>
                    <li>• <strong>Botnostic Solutions</strong> - Calculated from TalentX Data</li>
                    <li>• <strong>LinkedIn Page Engagement</strong> - Calculated from LinkedIn Reports (Followers, Visitors, Content)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KPI Details Modal */}
        {showModal && selectedKPI && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{selectedKPI.icon}</span>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800">{selectedKPI.kpi}</h2>
                    <p className="text-sm text-slate-500">{selectedKPI.companyPillar} • {selectedKPI.hrPillar}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-slate-600" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Only show current value section if KPI has meaningful data */}
                {selectedKPI.currentValue != null && selectedKPI.currentValue > 0 && (
                  <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-6 border-2 border-blue-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">Current Progress</p>
                        <p className="text-4xl font-bold text-slate-800">{selectedKPI.currentValue}%</p>
                      </div>
                      <div className="text-5xl">{selectedKPI.icon}</div>
                    </div>
                  </div>
               )}
              
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">2025 Target</p>
                  <p className="text-slate-800">{selectedKPI.target}</p>
                </div>
              
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">Description</p>
                  <p className="text-slate-700">{selectedKPI.details.description}</p>
                </div>
              
                {/* ADD THIS NEW DATA SOURCE SECTION HERE */}
                {selectedKPI.details.dataSource && (
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                    <p className="text-sm font-semibold text-green-800 uppercase tracking-wide mb-2">Data Source</p>
                    <p className="text-slate-700 font-medium">{selectedKPI.details.dataSource}</p>
                  </div>
                )}
                {/* END OF NEW DATA SOURCE SECTION */}

                {selectedKPI.details.formula && (
                  <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                    <p className="text-sm font-semibold text-blue-800 uppercase tracking-wide mb-3">Calculation Formula</p>
                    <div className="bg-white rounded-lg p-4 font-mono text-sm text-slate-800 border border-blue-300">
                      {selectedKPI.details.formula}
                    </div>
                  </div>
                )}
                {/* AI Tools Detailed View */}
                {selectedKPI.details.aiTools && (
                  <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-5 border-2 border-purple-300">
                    <p className="text-sm font-semibold text-purple-900 uppercase tracking-wide mb-4">
                      🤖 AI Solutions & Achievements
                    </p>
                    <div className="space-y-4">
                      {selectedKPI.details.aiTools.map((tool, idx) => (
                        <div key={idx} className="bg-white rounded-lg p-4 border border-purple-200">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h4 className="font-bold text-slate-800 text-base">{tool.name}</h4>
                              <p className="text-sm text-slate-600 mt-1">{tool.category}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              tool.status === 'Operational' ? 'bg-green-100 text-green-800' :
                              tool.status === 'Achieved' ? 'bg-blue-100 text-blue-800' :
                              tool.status === 'In Implementation' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {tool.status}
                            </span>
                          </div>
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                              Key Achievements
                            </p>
                            <ul className="space-y-1.5">
                              {tool.achievements.map((achievement, aidx) => (
                                <li key={aidx} className="text-sm text-slate-700 flex items-start gap-2">
                                  <span className="text-purple-500 font-bold mt-0.5">✓</span>
                                  <span>{achievement}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                

                {selectedKPI.details.additionalInfo && (
                  <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                    <p className="text-sm font-semibold text-amber-800 uppercase tracking-wide mb-2">Additional Information</p>
                    <p className="text-slate-700">{selectedKPI.details.additionalInfo}</p>
                  </div>
                )}

                {selectedKPI.kpi === 'Diversity & Inclusion Index' && calculatedKPIs.diversityBreakdowns && (
                  <div className="space-y-4">
                    {/* Gender Breakdown */}
                    <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                      <p className="text-sm font-semibold text-blue-800 uppercase tracking-wide mb-3">
                        Gender Distribution (Approximate)
                      </p>
                      <div className="space-y-2">
                        {Object.entries(calculatedKPIs.diversityBreakdowns.gender).map(([gender, percentage]) => (
                          <div key={gender}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-700">{gender}</span>
                              <span className="font-bold text-slate-800">{percentage}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-3">
                              <div
                                className="h-3 rounded-full bg-blue-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                
                    {/* Age Breakdown */}
                    <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200">
                      <p className="text-sm font-semibold text-green-800 uppercase tracking-wide mb-3">
                        Age Distribution
                      </p>
                      <div className="space-y-2">
                        {Object.entries(calculatedKPIs.diversityBreakdowns.age).map(([ageGroup, percentage]) => (
                          <div key={ageGroup}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-700">{ageGroup}</span>
                              <span className="font-bold text-slate-800">{percentage}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-3">
                              <div
                                className="h-3 rounded-full bg-green-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                
                    {/* Religion Breakdown */}
                    <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
                      <p className="text-sm font-semibold text-purple-800 uppercase tracking-wide mb-3">
                        Religious Distribution
                      </p>
                      <div className="space-y-2">
                        {Object.entries(calculatedKPIs.diversityBreakdowns.religion).map(([religion, percentage]) => (
                          <div key={religion}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-700">{religion}</span>
                              <span className="font-bold text-slate-800">{percentage}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-3">
                              <div
                                className="h-3 rounded-full bg-purple-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <span className="text-sm text-slate-600 font-medium">Status:</span>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-bold ${
                      selectedKPI.status === 'Start Tracking'
                        ? 'bg-yellow-100 text-yellow-800'
                        : selectedKPI.status === 'Planning'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {selectedKPI.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRKPIDashboard;
