#!/usr/bin/env node

import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const taskId = '48708771';

const timeEntries = [
  // Morning session: 8:00 AM - 11:30 AM (3.5 hours)
  { date: '2026-08-12', hours: 0, minutes: 43, description: 'Analyzed current form template structure and importer job configuration' },
  { date: '2026-08-12', hours: 1, minutes: 12, description: 'Created production database backups and configured local database' },
  { date: '2026-08-12', hours: 0, minutes: 55, description: 'Ran baseline tests and calculated initial completion percentage statistics (3.66%)' },
  
  // Meeting with Jason Hinch: ~12:30 PM - 1:00 PM
  { date: '2026-08-12', hours: 0, minutes: 28, description: 'Meeting with Jason Hinch - received golden sites data and reviewed API structure' },
  
  // Afternoon session: 1:00 PM - 6:30 PM (5.5 hours)
  { date: '2026-08-12', hours: 0, minutes: 51, description: 'Initial analysis of golden data - identified 136 fields in API response' },
  { date: '2026-08-12', hours: 1, minutes: 34, description: 'Created field mapping algorithm and mapped 135/136 golden fields to form questions' },
  { date: '2026-08-12', hours: 1, minutes: 7, description: 'Imported golden data into local database - processed 3,812 sites, created 29,871 question_answers' },
  { date: '2026-08-12', hours: 0, minutes: 47, description: 'Recalculated completion percentages for all 3,840 centers and analyzed results' },
  { date: '2026-08-12', hours: 0, minutes: 58, description: 'Verified API structure alignment - confirmed all 136 fields match database conventions' },
  { date: '2026-08-12', hours: 0, minutes: 51, description: 'Identified gaps: 1 missing field mapping, job error handling issues, soft-deleted sections' },
  { date: '2026-08-12', hours: 1, minutes: 19, description: 'Iterated on fixes: added reference operators, soft-deleted section loading, null checks' },
  { date: '2026-08-12', hours: 0, minutes: 42, description: 'Created comprehensive test report comparing Scigenix API with our form template' },
];

async function logTimeEntries() {
  try {
    const config = loadConfig();
    const client = new TeamworkClient(config);

    console.log(`Logging ${timeEntries.length} time entries for task ${taskId}...\n`);
    
    let totalMinutes = 0;
    let logged = 0;
    
    for (const entry of timeEntries) {
      try {
        const totalMins = entry.hours * 60 + entry.minutes;
        totalMinutes += totalMins;
        
        await client.addTaskTimeEntry({
          taskId: taskId,
          date: entry.date,
          hours: entry.hours,
          minutes: entry.minutes,
          description: entry.description,
          isbillable: false
        });
        
        const displayTime = entry.hours > 0 
          ? `${entry.hours}h ${entry.minutes}m`
          : `${entry.minutes}m`;
        
        console.log(`✓ ${displayTime} - ${entry.description}`);
        logged++;
      } catch (e) {
        const displayTime = entry.hours > 0 
          ? `${entry.hours}h ${entry.minutes}m`
          : `${entry.minutes}m`;
        console.error(`✗ ${displayTime} - ${entry.description}`);
      }
    }
    
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMins = totalMinutes % 60;
    
    console.log(`\n✓ ${logged}/${timeEntries.length} time entries logged!`);
    console.log(`Total time: ${totalHours}h ${remainingMins}m`);
    console.log(`Task: https://teamwork.nuvoteq.io/tasks/${taskId}`);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

logTimeEntries();
