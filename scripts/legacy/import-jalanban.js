const path = require('path');
const XLSX = require('xlsx');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_PROTECTION_THRESHOLD_MV } = require('../../www/js/services/status.js');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const FILE_PATH = path.join(__dirname, '..', '..', 'data', 'JalanBan_ITP.xlsx');
const LOCATION_NAME = 'Jalan Ban';
const SOURCE_FILE = 'JalanBan_ITP.xlsx';
const BATCH_SIZE = 500;

const REQUIRED_COLUMNS = [
  'Time',
  'TestPoint1 (mV)',
  'TestPoint2 (mV)',
  'TestPoint3 (mV)',
  'TestPoint4 (mV)',
  'Temp (Degree C)',
  'MediumConductivity',
  'PH',
  'Dissolved Oxygen',
  'Power (Watts)'
];

const TEST_POINT_COLUMNS = [
  ['TestPoint1', 'TestPoint1 (mV)'],
  ['TestPoint2', 'TestPoint2 (mV)'],
  ['TestPoint3', 'TestPoint3 (mV)'],
  ['TestPoint4', 'TestPoint4 (mV)']
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

function ensureSecretKey(key) {
  if (key.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is currently a publishable browser key. Use the service role/secret key for this local importer.'
    );
  }
}

function excelSerialToParts(serial) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const fractionalDay = serial - Math.floor(serial) + 0.0000001;
  const totalSeconds = Math.floor(86400 * fractionalDay);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  return {
    year: dateInfo.getUTCFullYear(),
    month: dateInfo.getUTCMonth() + 1,
    day: dateInfo.getUTCDate(),
    hour: hours,
    minute: minutes,
    second: seconds
  };
}

function singaporePartsToIso({ year, month, day, hour, minute, second }) {
  return new Date(Date.UTC(
    year,
    month - 1,
    day,
    hour - 8,
    minute,
    second
  )).toISOString();
}

function parseSingaporeTimestamp(value) {
  if (value instanceof Date) {
    return singaporePartsToIso({
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds()
    });
  }

  if (typeof value === 'number') {
    return singaporePartsToIso(excelSerialToParts(value));
  }

  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    throw new Error(`Invalid timestamp "${text}". Expected DD/MM/YYYY HH:mm.`);
  }

  const [, day, month, year, hour, minute, second = '0'] = match;
  return singaporePartsToIso({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second)
  });
}

function toNumber(value, columnName, rowNumber, required = true) {
  if (value === null || value === undefined || value === '') {
    if (required) {
      throw new Error(`Missing ${columnName} at Excel row ${rowNumber}`);
    }
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid number in ${columnName} at Excel row ${rowNumber}: ${value}`);
  }
  return number;
}

function toInteger(value, columnName, rowNumber) {
  return Math.round(toNumber(value, columnName, rowNumber));
}

function validateColumns(row) {
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !(column in row));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }
}

async function fetchLocationAndTestPoints(supabase) {
  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('id, site_name')
    .eq('site_name', LOCATION_NAME)
    .single();

  if (locationError) {
    throw new Error(`Could not find location "${LOCATION_NAME}": ${locationError.message}`);
  }

  const { data: testPoints, error: testPointError } = await supabase
    .from('test_points')
    .select('id, label, threshold_mv')
    .eq('location_id', location.id)
    .in('label', TEST_POINT_COLUMNS.map(([label]) => label));

  if (testPointError) {
    throw new Error(`Could not load test points: ${testPointError.message}`);
  }

  const testPointByLabel = new Map(testPoints.map((testPoint) => [testPoint.label, testPoint]));
  const missingTestPoints = TEST_POINT_COLUMNS
    .map(([label]) => label)
    .filter((label) => !testPointByLabel.has(label));

  if (missingTestPoints.length > 0) {
    throw new Error(`Missing test points for ${LOCATION_NAME}: ${missingTestPoints.join(', ')}`);
  }

  return { location, testPointByLabel };
}

async function ensureImportWasNotAlreadyRun(supabase) {
  if (process.env.ALLOW_DUPLICATE_IMPORT === 'true') {
    return;
  }

  const { count, error } = await supabase
    .from('reading_batches')
    .select('id', { count: 'exact', head: true })
    .eq('source_file', SOURCE_FILE);

  if (error) {
    throw new Error(`Could not check previous imports: ${error.message}`);
  }

  if (count > 0) {
    throw new Error(
      `${SOURCE_FILE} already has ${count} imported batch rows. Set ALLOW_DUPLICATE_IMPORT=true in .env only if you intentionally want duplicates.`
    );
  }
}

function validateRows(rows) {
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    parseSingaporeTimestamp(row.Time);
    toNumber(row['Temp (Degree C)'], 'Temp (Degree C)', rowNumber, false);
    toNumber(row.MediumConductivity, 'MediumConductivity', rowNumber, false);
    toNumber(row.PH, 'PH', rowNumber, false);
    toNumber(row['Dissolved Oxygen'], 'Dissolved Oxygen', rowNumber, false);
    toNumber(row['Power (Watts)'], 'Power (Watts)', rowNumber, false);

    TEST_POINT_COLUMNS.forEach(([, columnName]) => {
      toInteger(row[columnName], columnName, rowNumber);
    });
  });
}

async function insertChunk(supabase, chunk, location, testPointByLabel, startIndex) {
  const batchRows = chunk.map(({ row, rowNumber }) => ({
    location_id: location.id,
    reading_ts: parseSingaporeTimestamp(row.Time),
    entered_by: null,
    upload_method: 'bulk',
    temperature_c: toNumber(row['Temp (Degree C)'], 'Temp (Degree C)', rowNumber, false),
    medium_conductivity: toNumber(row.MediumConductivity, 'MediumConductivity', rowNumber, false),
    ph: toNumber(row.PH, 'PH', rowNumber, false),
    dissolved_oxygen: toNumber(row['Dissolved Oxygen'], 'Dissolved Oxygen', rowNumber, false),
    power_watts: toNumber(row['Power (Watts)'], 'Power (Watts)', rowNumber, false),
    source_file: SOURCE_FILE
  }));

  const { data: insertedBatches, error: batchError } = await supabase
    .from('reading_batches')
    .insert(batchRows)
    .select('id');

  if (batchError) {
    throw new Error(`Failed inserting batch rows near input row ${startIndex + 2}: ${batchError.message}`);
  }

  const readingRows = [];

  chunk.forEach(({ row, rowNumber }, index) => {
    const batchId = insertedBatches[index].id;

    TEST_POINT_COLUMNS.forEach(([label, columnName]) => {
      const testPoint = testPointByLabel.get(label);
      readingRows.push({
        batch_id: batchId,
        test_point_id: testPoint.id,
        value_mv: toInteger(row[columnName], columnName, rowNumber),
        threshold_mv_snapshot: DEFAULT_PROTECTION_THRESHOLD_MV
      });
    });
  });

  const { error: readingError } = await supabase
    .from('test_point_readings')
    .insert(readingRows);

  if (readingError) {
    throw new Error(`Failed inserting test point readings near input row ${startIndex + 2}: ${readingError.message}`);
  }
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  ensureSecretKey(serviceRoleKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const workbook = XLSX.readFile(FILE_PATH, { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true });

  if (rows.length === 0) {
    throw new Error(`No rows found in ${SOURCE_FILE}`);
  }

  validateColumns(rows[0]);
  validateRows(rows);

  const { location, testPointByLabel } = await fetchLocationAndTestPoints(supabase);
  await ensureImportWasNotAlreadyRun(supabase);
  const rowsWithNumbers = rows.map((row, index) => ({ row, rowNumber: index + 2 }));

  console.log(`Importing ${rows.length} rows from ${SOURCE_FILE} into ${LOCATION_NAME}...`);

  for (let index = 0; index < rowsWithNumbers.length; index += BATCH_SIZE) {
    const chunk = rowsWithNumbers.slice(index, index + BATCH_SIZE);
    await insertChunk(supabase, chunk, location, testPointByLabel, index);
    console.log(`Imported ${Math.min(index + chunk.length, rows.length)} / ${rows.length} spreadsheet rows`);
  }

  console.log('Import complete.');
  console.log(`Expected inserted rows: ${rows.length} reading_batches and ${rows.length * TEST_POINT_COLUMNS.length} test_point_readings.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
