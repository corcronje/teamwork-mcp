import { Task } from './src/Task.js';
import { TeamworkClient } from './src/teamworkClient.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const client = new TeamworkClient(config);

const task = new Task('938241');
task.title = 'Clinical Trials Data Sync: Refactor Import Job & Fix Field Alignment';
task.description = `## Overview
Clinical trials data is syncing from Scigenix API but with field mapping misalignments and data quality issues affecting trial records and form displays.

## Discovery Analysis - Field Mapping Issues

**Data Volume:**
- 37,723 trials imported
- 10-30% missing fields per trial
- Low form completion percentages (83% when should be 100%)

**Root Causes Identified:**

1. **Field Name Mismatches** (Lines 24-38 in ImportsDataController)
   - "Entities" field maps to null (should map to entities data)
   - "Sites" field contains malformed JSON data
   - Multiple fields have incomplete or incorrect mappings
   - Question map has ~180 entries but many lack proper targets

2. **Data Quality Issues**
   - Trial ID: Stored but not displayed in form (shows in header only)
   - Contributor field: Missing in form display
   - Entities/Sites links: Population failing (null field mapping)
   - Date handling: End date parsing (line 687) vulnerable to format issues
   - Status field: Incorrectly derived from end date only (line 688)

3. **Import Logic Problems** (Lines 565-644)
   - Batch processing hardcoded to 36000 trials (line 601)
   - Memory limit: 4GB for batch (line 597) - excessive and inefficient
   - Hardcoded offset/limit: 4000 per batch, 30s sleep - inflexible
   - No progress tracking or rate limiting strategy
   - Sleep statement blocks entire request (line 623)
   - No batch failure recovery

4. **Field Handling Issues**
   - geo_point parsing: Uses string replacement and isJson twice (lines 346-354, 419-424)
   - Duplicate code: geo_point and site data processing repeated
   - No validation of JSON integrity before parsing
   - flatstructure[] fields accessed without null checks

## Code Review Findings

**Stability Issues:**
- TrialImportSafetyService dependency (line 663) - unclear behavior
- Scigenix token caching: expires after 5 days (line 199) but not validated
- No retry logic within batch processing
- HTTP timeout: 15 min (line 225) - long and blocking
- Silent failures on JSON parsing (no try/catch)

**Performance Issues:**
- processSectionFormQuestions() called for every record - potential bottleneck
- notifyScigenix() call synchronous - blocks import completion
- No chunked processing of form questions
- Memory set to 4096M per batch - can be 512M with proper streaming

**Simplification Opportunities:**
- Field mapping: Create dedicated FieldMapper service instead of large array
- Duplicate code: Extract geo_point parsing to utility method
- Batch logic: Move to Job class with configurable batch size
- Error handling: Use try/catch blocks instead of silent failures
- Logging: Add progress milestones and timing information

## Recommendations

### Phase 1: Stability (CRITICAL)
- Add null checks for all field accesses
- Wrap geo_point parsing in try/catch
- Validate field existence before processing
- Add logging for each processed record
- Create error registry for failed records

### Phase 2: Refactoring (IMPORTANT)
- Extract FieldMapper class
- Create GeometryParser utility
- Move batch logic to ImportTrialsJob class
- Reduce memory allocation to 512M
- Implement proper error recovery

### Phase 3: Enhancement (NICE-TO-HAVE)
- Add configurable batch sizes
- Implement async notify-to-scigenix
- Add import progress tracking
- Create import dashboard/reporting
- Document field mapping requirements

### Phase 4: Fix Field Alignment
- Verify "Entities" field mapping (currently null)
- Map Trial ID to form display
- Map Contributor field properly
- Validate Sites/Links population logic
- Test form completion percentages

## Key Files
- Controller: app/Http/Controllers/Api/V1/CTCData/ImportsDataController.php (1200+ lines)
- Safety Service: app/Services/CTCData/TrialImportSafetyService.php
- Question Map: Lines 24-180 in ImportsDataController

## Testing Strategy
1. Unit tests for field mapping
2. Integration tests with Scigenix mock data
3. Performance baseline with 4000 trial batch
4. Form display validation for all mapped fields
5. Error recovery testing

## Estimated Scope
- Phase 1: 8-12 hours (critical fixes)
- Phase 2: 16-20 hours (refactoring)
- Phase 3: 8-12 hours (enhancements)
- Phase 4: 4-6 hours (alignment fixes)

## Success Criteria
- Zero missing field mappings
- Form completion >98%
- All trial fields visible and populated
- Import completes in <10 minutes
- Zero silent failures
- Proper error reporting for failed records`;

task.validate();
const result = await client.createTask(task.toParams());
const taskId = result.task.id || result.id;

console.log('✅ Task Created Successfully\n');
console.log('Task ID:', taskId);
console.log('Title:', result.task.name);
console.log('Project: CTC.Africa (938241)');
console.log('Status: Ready for Work');
