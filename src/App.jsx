import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import initSqlJs from 'sql.js';
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  TextField,
  Select,
  MenuItem,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  Snackbar,
  Tabs,
  Tab,
  Box,
  List,
  ListItem,
  ListItemText,
  FormControlLabel,
  Checkbox,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Upload as UploadIcon,
  Delete as DeleteIcon,
  GetApp as GetAppIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import './index.css';
import useDebounce from './hooks/useDebounce'; // New debounce hook

// =====================
// DB-Funktionen & IndexedDB-Persistenz
// =====================

// IndexedDB-Setup und -Funktionen

// Globale Variablen für IndexedDB
let dbInstance = null;
const DB_NAME = 'SqliteStorage';
const STORE_NAME = 'sqliteDB';
const DB_KEY = 'database';

// Öffnet oder erstellt die IndexedDB
const openIndexedDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Objektstore ohne keyPath erstellen, um eigenständig Schlüssel zu setzen
        db.createObjectStore(STORE_NAME);
        console.log(`Created object store: ${STORE_NAME}`);
      }
    };

    request.onsuccess = () => {
      console.log('IndexedDB opened successfully.');
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('Error opening IndexedDB:', request.error);
      reject(request.error);
    };
  });
};

// Angepasste saveToIndexedDB Funktion
const saveToIndexedDB = async (sqliteDB) => {
  try {
    const data = sqliteDB.export(); // Uint8Array aus SQL.js
    console.log("saveToIndexedDB, Uint8Array length:", data.length);
    
    // Konvertiere Uint8Array direkt in einen ArrayBuffer
    const dataBuffer = new ArrayBuffer(data.length);
    const view = new Uint8Array(dataBuffer);
    view.set(data);
    
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Speichere den ArrayBuffer direkt
      const request = store.put(dataBuffer, DB_KEY);
      
      request.onsuccess = () => {
        console.log('Successfully saved to IndexedDB');
        resolve();
      };
      
      request.onerror = () => {
        console.error('Error saving to IndexedDB:', request.error);
        reject(request.error);
      };

      // Wichtig: Transaction-Fehlerbehandlung hinzufügen
      transaction.onerror = () => {
        console.error('Transaction error:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Failed to save to IndexedDB:', error);
    throw error;
  }
};

// Angepasste loadFromIndexedDB Funktion
const loadFromIndexedDB = async () => {
  try {
    const idb = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const transaction = idb.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DB_KEY);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else if (result) {
          console.warn('Unexpected data type in IndexedDB:', typeof result);
          resolve(result);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => reject(request.error);
      
      transaction.onerror = () => {
        console.error('Transaction error:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('Failed to load from IndexedDB:', error);
    throw error;
  }
};

// Angepasste initializeDB Funktion
const initializeDB = async () => {
  if (!dbInstance) {
    try {
      const SQL = await initSqlJs({ 
        locateFile: file => `${window.location.origin}/sql-wasm.wasm` 
      });
      
      const savedData = await loadFromIndexedDB();
      if (savedData) {
        // Stelle sicher, dass wir einen ArrayBuffer haben
        const dataArray = new Uint8Array(savedData);
        dbInstance = new SQL.Database(dataArray);
        console.log('Database loaded from IndexedDB');
      } else {
        dbInstance = new SQL.Database();
        console.log('New database created');
      }
      
      // Warte explizit auf das Erstellen der Tabelle
      await createTable(dbInstance);
      return dbInstance;
    } catch (error) {
      console.error('Database initialization failed:', error);
      dbInstance = null; // Setze die Instanz zurück bei Fehler
      throw new Error('Failed to initialize database');
    }
  }
  return dbInstance;
};

// Erstellt die Tabelle (falls nicht vorhanden) und speichert die DB anschließend wieder in IndexedDB.
const createTable = async (db) => {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS jsonData (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tm TEXT,
        gln TEXT,
        gtin TEXT,
        tics TEXT,
        json_data TEXT
      )
    `);
    console.log('jsonData Tabelle erstellt (oder bereits vorhanden). Speichere DB in IndexedDB...');
    await saveToIndexedDB(db);
    console.log('Datenbank nach Tabellenerstellung in IndexedDB gespeichert.');
  } catch (error) {
    console.error('Table creation failed:', error);
    throw new Error('Failed to create table');
  }
};

const saveData = async (tm, gln, gtin, tics, jsonDataString) => {
  try {
    const db = await initializeDB();
    db.run(
      `INSERT INTO jsonData (tm, gln, gtin, tics, json_data)
       VALUES (?, ?, ?, ?, ?)`,
      [tm, gln, gtin, tics, jsonDataString]
    );
    await saveToIndexedDB(db);
    return true;
  } catch (error) {
    console.error('Data save failed:', error);
    throw new Error('Failed to save data');
  }
};

const loadData = async () => {
  try {
    const db = await initializeDB();
    const result = db.exec("SELECT json_data FROM jsonData");
    if (result && result[0] && result[0].values) {
      return result[0].values.map(row => JSON.parse(row[0]));
    }
    return [];
  } catch (error) {
    console.error('Data load failed:', error);
    throw new Error('Failed to load data');
  }
};

const clearAllData = async () => {
  try {
    await clearIndexedDB();
    dbInstance = null;
    await initializeDB();
    return true;
  } catch (error) {
    console.error('Failed to clear data:', error);
    throw new Error('Failed to clear data');
  }
};

// =====================
// CSV-Parsing und Mapping-Funktionen
// =====================

const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (!lines.length) return [];
  
  // Determine the delimiter based on the header line
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  
  const header = headerLine.split(delimiter).map(h => h.trim());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim());
    if (values.length === header.length) {
      const row = {};
      header.forEach((h, idx) => {
        row[h] = values[idx];
      });
      rows.push(row);
    }
  }
  return rows;
};

const mapCSVRow = (row) => {
  // Map CSV keys to the ones used in your DB update logic.
  return {
    tm: row['tm'],
    gln: row['gln'],
    gtin: row['gtin'],
    tics: row['tics'],
    eventno: row['virpcs'], // using "virpcs" as eventno
    datumSichtpruefung: row['visualInspectionDate'],
    datumSichtpruefungsausloesung: row['systemCertificationDate'],
    sichtpruefungsergebnis: row['visualInspectionState'],
    automatischesErgebnis: row['systemValidationState'],
    siegel: row['certificationState'],
  };
};

const updateCSVDataInDB = async (tm, gln, gtin, tics, csvData) => {
  try {
    const db = await initializeDB();
    const stmt = db.prepare("SELECT json_data FROM jsonData WHERE tm=? AND gln=? AND gtin=? AND tics=?");
    stmt.bind([tm, gln, gtin, tics]);
    let found = false;
    while (stmt.step()) {
      found = true;
      const row = stmt.get();
      let jsonData = JSON.parse(row[0]);
      if (!jsonData.csv) {
        jsonData.csv = [];
      }
      if (!jsonData.csv.some(existing => existing.eventno === csvData.eventno)) {
        jsonData.csv.push(csvData);
        db.run("UPDATE jsonData SET json_data = ? WHERE tm=? AND gln=? AND gtin=? AND tics=?",
          [JSON.stringify(jsonData), tm, gln, gtin, tics]);
      }
    }
    stmt.free();
    await saveToIndexedDB(db);
    return found;
  } catch (error) {
    console.error("Fehler beim Aktualisieren der CSV-Daten in der DB:", error);
    throw error;
  }
};

const saveCSVData = async (tm, gln, gtin, tics, csvData) => {
  try {
    const db = await initializeDB();
    const jsonData = {
      tm,
      gln,
      gtin,
      tics,
      csv: [ csvData ],
    };
    db.run(
      `INSERT INTO jsonData (tm, gln, gtin, tics, json_data)
       VALUES (?, ?, ?, ?, ?)`,
      [tm, gln, gtin, tics, JSON.stringify(jsonData)]
    );
    await saveToIndexedDB(db);
    return true;
  } catch (error) {
    console.error("Fehler beim Speichern der CSV-Daten in der DB:", error);
    throw error;
  }
};

const updateJSONDataInDB = async (tm, gln, gtin, tics, newJsonData) => {
  try {
    const db = await initializeDB();
    const stmt = db.prepare("SELECT json_data FROM jsonData WHERE tm=? AND gln=? AND gtin=? AND tics=?");
    stmt.bind([tm, gln, gtin, tics]);
    let found = false;
    while (stmt.step()) {
      found = true;
      const row = stmt.get();
      let existingData = JSON.parse(row[0]);
      if (!existingData.properties) {
        existingData.properties = [];
      }
      newJsonData.properties.forEach(newProp => {
        if (!existingData.properties.some(prop => prop["m-number"] === newProp["m-number"])) {
          existingData.properties.push(newProp);
        }
      });
      db.run("UPDATE jsonData SET json_data = ? WHERE tm=? AND gln=? AND gtin=? AND tics=?",
        [JSON.stringify(existingData), tm, gln, gtin, tics]);
    }
    stmt.free();
    await saveToIndexedDB(db);
    return found;
  } catch (error) {
    console.error("Fehler beim Aktualisieren der JSON-Daten in der DB:", error);
    throw error;
  }
};

const transformProperties = (properties) => {
  return properties.map(property => {
    const valuesObject = {};
    if (Array.isArray(property.values)) {
      property.values.forEach(val => {
        if (valuesObject[val.name]) {
          if (Array.isArray(valuesObject[val.name])) {
            valuesObject[val.name].push(val.value);
          } else {
            valuesObject[val.name] = [valuesObject[val.name], val.value];
          }
        } else {
          valuesObject[val.name] = val.value;
        }
      });
    } else if (typeof property.values === 'object' && property.values !== null) {
      Object.entries(property.values).forEach(([key, val]) => {
        valuesObject[key] = val;
      });
    }
    return {
      "m-number": property["m-number"],
      ...valuesObject
    };
  });
};

const getDifferences = (group) => {
  if (!group.ticsData || group.ticsData.length <= 1) return "";
  const differences = [];
  let mNumbers = new Set();
  group.ticsData.forEach(ticsEntry => {
    if (ticsEntry.properties) {
      ticsEntry.properties.forEach(prop => {
        if (prop["m-number"]) {
          mNumbers.add(prop["m-number"]);
        }
      });
    }
  });
  mNumbers = Array.from(mNumbers);
  mNumbers.forEach(mNum => {
    const values = group.ticsData.map(ticsEntry =>
      ticsEntry.properties.find(prop => prop["m-number"] === mNum)
    );
    if (values.some(val => val === undefined)) {
      differences.push(mNum);
    } else {
      const firstVal = JSON.stringify(values[0]);
      const allSame = values.every(val => JSON.stringify(val) === firstVal);
      if (!allSame) {
        differences.push(mNum);
      }
    }
  });
  return differences.join(", ");
};

// =====================
// UI-Komponenten
// =====================

const ActionsBar = ({
  filterText,
  onFilterChange,
  selectedGtin,
  onGtinChange,
  gtinOptions,
  onFileUpload,
  onCSVFileUpload,
  onClearData,
  onExportData,
  matchFilter,
  onMatchFilterChange,
}) => {
  return (
    <AppBar position="static" color="default">
      <Toolbar>
        {/* JSON Datei-Upload */}
        <input
          accept="application/json"
          style={{ display: 'none' }}
          id="upload-json"
          type="file"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              onFileUpload(e.target.files[0]);
            }
          }}
        />
        <label htmlFor="upload-json">
          <IconButton color="primary" component="span">
            <UploadIcon />
          </IconButton>
        </label>

        {/* CSV Datei-Upload */}
        <input
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          id="upload-csv"
          type="file"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              onCSVFileUpload(e.target.files[0]);
            }
          }}
        />
        <label htmlFor="upload-csv">
          <IconButton color="primary" component="span">
            <DescriptionIcon />
          </IconButton>
        </label>

        {/* Text-Filter */}
        <TextField
          label="Suchen"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          variant="outlined"
          size="small"
          style={{ margin: '0 1rem' }}
        />

        {/* GTIN-Dropdown */}
        <Select
          value={selectedGtin}
          onChange={(e) => onGtinChange(e.target.value)}
          variant="outlined"
          size="small"
          style={{ marginRight: '1rem' }}
        >
          <MenuItem value="">Alle GTINs</MenuItem>
          {gtinOptions.map((gtin) => (
            <MenuItem key={gtin} value={gtin}>
              {gtin}
            </MenuItem>
          ))}
        </Select>

        {/* Neuer Filter: Nur CSV/JSON Matches */}
        <FormControlLabel
          control={
            <Checkbox
              checked={matchFilter}
              onChange={(e) => onMatchFilterChange(e.target.checked)}
              color="primary"
            />
          }
          label="Nur CSV/JSON Matches"
        />

        {/* Export- und Clear-Aktionen */}
        <IconButton color="primary" onClick={onExportData}>
          <GetAppIcon />
        </IconButton>
        <IconButton color="secondary" onClick={onClearData}>
          <DeleteIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
};

const DataTable = React.memo(({ data, onRowClick }) => {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const paginatedGroups = useMemo(() => {
    const sortedGroups = [...data].sort((a, b) => a.tm.localeCompare(b.tm));
    return sortedGroups.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [data, page, rowsPerPage]);

  // Precompute differences for each group
  const groupDifferences = useMemo(() => {
    return paginatedGroups.map(group => getDifferences(group));
  }, [paginatedGroups]);

  const handleChangePage = useCallback((event, newPage) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  return (
    <Paper style={{ margin: '1rem', padding: '1rem' }}>
      <div className="table-container">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell style={{ minWidth: '50px' }}>ID</TableCell>
              <TableCell>TM</TableCell>
              <TableCell>GLN</TableCell>
              <TableCell>GTIN</TableCell>
              <TableCell>TICS</TableCell>
              <TableCell>Unterschiede</TableCell>
              <TableCell>CSV</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedGroups.map((group, groupIndex) => {
              const differences = groupDifferences[groupIndex];
              return group.ticsData.map((ticsEntry, index) => (
                <TableRow
                  key={`${group.tm}-${group.gln}-${group.gtin}-${index}`}
                  hover
                  onClick={() => onRowClick(group)}
                >
                  {index === 0 && (
                    <TableCell rowSpan={group.ticsData.length} style={{ minWidth: '50px' }}>
                      {page * rowsPerPage + groupIndex + 1}
                    </TableCell>
                  )}
                  {index === 0 && (
                    <>
                      <TableCell rowSpan={group.ticsData.length}>{group.tm}</TableCell>
                      <TableCell rowSpan={group.ticsData.length}>{group.gln}</TableCell>
                      <TableCell rowSpan={group.ticsData.length}>{group.gtin}</TableCell>
                    </>
                  )}
                  <TableCell>{ticsEntry.tics}</TableCell>
                  {index === 0 && (
                    <TableCell rowSpan={group.ticsData.length}>
                      {differences}
                    </TableCell>
                  )}
                  <TableCell>{ticsEntry.csv ? ticsEntry.csv.length : '-'}</TableCell>
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={data.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </div>
    </Paper>
  );
});

const DetailsModal = React.memo(({ open, onClose, dataItem }) => {
  const [tabIndex, setTabIndex] = useState(0);

  useEffect(() => {
    setTabIndex(0);
  }, [dataItem]);

  const handleTabChange = (event, newValue) => {
    setTabIndex(newValue);
  };

  // Helper to format an object als human-friendly string ohne "m-number"
  const formatObject = (obj) =>
    Object.entries(obj)
      .filter(([key]) => key !== 'm-number')
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');

  // Helper to compute detailed differences for properties (by m-number)
  const getDifferenceDetails = useCallback(() => {
    if (!dataItem || !dataItem.ticsData || dataItem.ticsData.length <= 1) return [];
    let allMNumbers = new Set();
    dataItem.ticsData.forEach(entry => {
      if (entry.properties) {
        entry.properties.forEach(prop => {
          if (prop["m-number"]) {
            allMNumbers.add(prop["m-number"]);
          }
        });
      }
    });
    allMNumbers = Array.from(allMNumbers);
    const details = [];
    allMNumbers.forEach(mNum => {
      const values = dataItem.ticsData.map(entry => {
        const p = entry.properties ? entry.properties.find(prop => prop["m-number"] === mNum) : null;
        return p ? formatObject(p) : "—";
      });
      if (!values.every(v => v === values[0])) {
        details.push({ mNumber: mNum, values });
      }
    });
    return details;
  }, [dataItem]);

  const differenceDetails = useMemo(() => getDifferenceDetails(), [getDifferenceDetails]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Details zu {dataItem?.gtin}</DialogTitle>
      <Tabs
        value={tabIndex}
        onChange={handleTabChange}
        indicatorColor="primary"
        textColor="primary"
        variant="fullWidth"
      >
        <Tab label="Formatiert" />
        <Tab label="Rohdaten" />
        <Tab label="Unterschiede" />
      </Tabs>
      <DialogContent dividers>
        {tabIndex === 0 && dataItem ? (
          <Box>
            <Typography variant="h6">Allgemeine Informationen</Typography>
            <List>
              <ListItem>
                <ListItemText primary="TM" secondary={dataItem.tm} />
              </ListItem>
              <ListItem>
                <ListItemText primary="GLN" secondary={dataItem.gln} />
              </ListItem>
              <ListItem>
                <ListItemText primary="GTIN" secondary={dataItem.gtin} />
              </ListItem>
            </List>
            <Typography variant="h6" style={{ marginTop: '1rem' }}>
              TICS Daten
            </Typography>
            {dataItem.ticsData &&
              dataItem.ticsData.map((entry, idx) => (
                <Box
                  key={idx}
                  mb={2}
                  p={1}
                  border={1}
                  borderRadius={4}
                  borderColor="grey.300"
                >
                  <Typography variant="subtitle1">TICS: {entry.tics}</Typography>
                  {entry.properties && entry.properties.length > 0 && (
                    <>
                      <Typography variant="subtitle2">Properties:</Typography>
                      <List dense>
                        {entry.properties.map((prop, pIdx) => (
                          <ListItem key={pIdx}>
                            <ListItemText
                              primary={prop["m-number"] || `Property ${pIdx + 1}`}
                              secondary={formatObject(prop)}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </>
                  )}
                  {entry.csv && entry.csv.length > 0 && (
                    <>
                      <Typography variant="subtitle2">CSV-Daten:</Typography>
                      <List dense>
                        {entry.csv.map((csvEntry, cIdx) => (
                          <ListItem key={cIdx}>
                            <ListItemText
                              primary={`CSV Eintrag ${cIdx + 1}`}
                              secondary={formatObject(csvEntry)}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </>
                  )}
                </Box>
              ))}
          </Box>
        ) : tabIndex === 1 && dataItem ? (
          <Box
            p={2}
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: 4,
              maxHeight: '500px',
              overflow: 'auto',
            }}
          >
            <pre style={{ margin: 0 }}>
              {JSON.stringify(dataItem, null, 2)}
            </pre>
          </Box>
        ) : tabIndex === 2 && dataItem ? (
          <Box p={2}>
            <Typography variant="h6" style={{ marginBottom: '1rem' }}>
              Vergleich der Unterschiede
            </Typography>
            {differenceDetails.length > 0 ? (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>MNumber</TableCell>
                    {dataItem.ticsData.map((entry, idx) => (
                      <TableCell key={idx} align="center">
                        TICS {entry.tics}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {differenceDetails.map((diff, diffIdx) => (
                    <TableRow key={diffIdx}>
                      <TableCell>{diff.mNumber}</TableCell>
                      {diff.values.map((value, valIdx) => (
                        <TableCell key={valIdx} align="center">
                          {value !== "—" ? value : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body1">
                Keine Unterschiede gefunden.
              </Typography>
            )}
          </Box>
        ) : null}
      </DialogContent>
    </Dialog>
  );
});

// =====================
// Hauptkomponente App (mit Drag & Drop und Performance-Optimierungen)
// =====================
const App = () => {
  const [data, setData] = useState([]);
  const [filterText, setFilterText] = useState('');
  const debouncedFilterText = useDebounce(filterText, 300);
  const [selectedGtin, setSelectedGtin] = useState('');
  const [matchFilter, setMatchFilter] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedDataItem, setSelectedDataItem] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    const initializeAndLoad = async () => {
      try {
        await initializeDB();
        const loadedData = await loadData();
        const groupMap = {};
        loadedData.forEach(jsonData => {
          const { tm, gln, gtin, tics } = jsonData;
          const key = `${tm}|${gln}|${gtin}`;
          const properties = jsonData.properties || [];
          const transformedProperties = transformProperties(properties);
          const newDataEntry = {
            tics,
            properties: transformedProperties,
            csv: jsonData.csv || []
          };
          if (groupMap[key]) {
            if (!groupMap[key].ticsData.some(entry => entry.tics === tics)) {
              groupMap[key].ticsData.push(newDataEntry);
            }
          } else {
            groupMap[key] = {
              tm,
              gln,
              gtin,
              ticsData: [newDataEntry],
            };
          }
        });
        setData(Object.values(groupMap));
      } catch (initError) {
        setError(initError.message);
        console.error('Fehler beim Laden der Daten:', initError);
      }
    };
    initializeAndLoad();
  }, []);

  const handleFileSelect = useCallback(async (jsonData) => {
    if (jsonData && typeof jsonData === 'object' && Object.keys(jsonData).length > 0) {
      try {
        const { tm, gln, gtin, tics } = jsonData;
        const properties = jsonData.properties || [];
        const transformedProperties = transformProperties(properties);
        const newDataEntry = { tics, properties: transformedProperties };

        setData(prevData => {
          const updatedData = [...prevData];
          const groupIndex = updatedData.findIndex(group => group.tm === tm && group.gln === gln && group.gtin === gtin);
          if (groupIndex !== -1) {
            let group = updatedData[groupIndex];
            const entryIndex = group.ticsData.findIndex(entry => entry.tics === tics);
            if (entryIndex !== -1) {
              const existingEntry = group.ticsData[entryIndex];
              transformedProperties.forEach(newProp => {
                if (!existingEntry.properties.some(prop => prop["m-number"] === newProp["m-number"])) {
                  existingEntry.properties.push(newProp);
                }
              });
            } else {
              group.ticsData.push(newDataEntry);
            }
          } else {
            updatedData.push({ tm, gln, gtin, ticsData: [newDataEntry] });
          }
          return updatedData;
        });

        const jsonObj = { ...jsonData, properties: transformedProperties };
        const updated = await updateJSONDataInDB(tm, gln, gtin, tics, jsonObj);
        if (!updated) {
          await saveData(tm, gln, gtin, tics, JSON.stringify(jsonData));
        }
        setSnackbarMessage(`Daten für ${tm}/${gln}/${gtin} gespeichert.`);
      } catch (e) {
        console.error('Fehler bei der Verarbeitung der JSON-Datei:', e);
        setError('Fehler beim Verarbeiten der JSON-Datei.');
      }
    } else {
      setError("Ungültiges JSON-Format. Bitte überprüfen Sie die Datei.");
    }
  }, []);

  const handleFileUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        handleFileSelect(jsonData);
      } catch (error) {
        console.error('Ungültige JSON-Datei:', error);
        setError('Bitte wähle eine gültige JSON-Datei aus.');
      }
    };
    reader.readAsText(file);
  }, [handleFileSelect]);

  const handleCSVFileUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csvText = event.target.result;
        handleCSVUpload(csvText);
      } catch (error) {
        console.error('Fehler beim Parsen der CSV-Datei:', error);
        setError('Bitte wähle eine gültige CSV-Datei aus.');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleCSVUpload = async (csvText) => {
    const rows = parseCSV(csvText);
    setData(prevData => {
      const updatedData = [...prevData];
      const groupMap = {};
      updatedData.forEach(group => {
        const key = `${group.tm}|${group.gln}|${group.gtin}`;
        groupMap[key] = group;
      });
      for (const row of rows) {
        const csvRow = mapCSVRow(row);
        const key = `${csvRow.tm}|${csvRow.gln}|${csvRow.gtin}`;
        if (groupMap[key]) {
          const group = groupMap[key];
          let ticsEntry = group.ticsData.find(entry => entry.tics === csvRow.tics);
          if (ticsEntry) {
            if (!ticsEntry.csv) {
              ticsEntry.csv = [];
            }
            // Hier wird nun korrekt auf csvRow.eventno zugegriffen.
            if (!ticsEntry.csv.some(existing => existing.eventno === csvRow.eventno)) {
              ticsEntry.csv.push(csvRow);
            }
          } else {
            group.ticsData.push({
              tics: csvRow.tics,
              properties: [],
              csv: [csvRow],
            });
          }
        } else {
          const newGroup = {
            tm: csvRow.tm,
            gln: csvRow.gln,
            gtin: csvRow.gtin,
            ticsData: [{
              tics: csvRow.tics,
              properties: [],
              csv: [csvRow],
            }],
          };
          updatedData.push(newGroup);
          groupMap[key] = newGroup;
        }
      }
      return updatedData;
    });
    // Aktualisiere die DB für jede CSV-Zeile
    for (const row of rows) {
      const csvRow = mapCSVRow(row);
      try {
        const updated = await updateCSVDataInDB(csvRow.tm, csvRow.gln, csvRow.gtin, csvRow.tics, csvRow);
        if (!updated) {
          await saveCSVData(csvRow.tm, csvRow.gln, csvRow.gtin, csvRow.tics, csvRow);
        }
      } catch (error) {
        console.error("Fehler beim Aktualisieren/Speichern der CSV-Daten in der DB:", error);
      }
    }
    setSnackbarMessage("CSV-Daten wurden verarbeitet.");
  };

  // Drag & Drop (für JSON)
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file && file.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const jsonData = JSON.parse(event.target.result);
            handleFileSelect(jsonData);
          } catch (error) {
            console.error('Fehler beim Verarbeiten der Drag & Drop Datei:', error);
            setError('Fehler beim Verarbeiten einer Drag & Drop Datei.');
          }
        };
        reader.readAsText(file);
      } else {
        setError('Bitte nur JSON-Dateien hochladen.');
      }
    });
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleClearData = async () => {
    try {
      await clearAllData();
      setData([]);
      setSnackbarMessage('Alle Daten wurden gelöscht.');
    } catch (err) {
      console.error('Fehler beim Löschen der Daten:', err);
      setError('Fehler beim Löschen der Daten.');
    }
  };

  const handleExportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export.json';
    a.click();
    setSnackbarMessage('Daten exportiert.');
  };

  const handleRowClick = (dataItem) => {
    setSelectedDataItem(dataItem);
    setDetailsModalOpen(true);
  };

  const gtinOptions = useMemo(() => Array.from(new Set(data.map(d => d.gtin))), [data]);

  // Update filtering using the debounced filter text
  const filteredData = useMemo(() => {
    return data.filter(group => {
      const matchesText =
        group.tm.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
        group.gln.toLowerCase().includes(debouncedFilterText.toLowerCase()) ||
        group.gtin.toLowerCase().includes(debouncedFilterText.toLowerCase());
      const matchesGtin = selectedGtin === '' || group.gtin === selectedGtin;
      let matchOk = true;
      if (matchFilter) {
        matchOk = group.ticsData.some(entry => (entry.csv && entry.csv.length > 0 && entry.properties && entry.properties.length > 0));
      }
      return matchesText && matchesGtin && matchOk;
    });
  }, [data, debouncedFilterText, selectedGtin, matchFilter]);

  console.log("App rendering: filteredData length:", filteredData.length);

  return (
    <div>
      <ActionsBar
        filterText={filterText}
        onFilterChange={setFilterText}  // TextField still hooks to filterText; updates will be debounced
        selectedGtin={selectedGtin}
        onGtinChange={setSelectedGtin}
        gtinOptions={useMemo(() => Array.from(new Set(data.map(d => d.gtin))), [data])}
        onFileUpload={handleFileUpload}
        onCSVFileUpload={handleCSVFileUpload}
        onClearData={handleClearData}
        onExportData={handleExportData}
        matchFilter={matchFilter}
        onMatchFilterChange={setMatchFilter}
      />

      {/* Drag & Drop Drop-Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: isDragging ? "2px dashed blue" : "2px dashed gray",
          padding: "20px",
          margin: "20px",
          textAlign: "center"
        }}
      >
        JSON-Dateien hier ablegen oder hochladen
      </div>

      <Typography variant="h5" style={{ margin: '1rem' }}>
        Verarbeitete Daten
      </Typography>

      <DataTable
        key={filteredData.length}
        data={filteredData}
        onRowClick={handleRowClick}
      />

      <DetailsModal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        dataItem={selectedDataItem}
      />

      <Snackbar
        open={snackbarMessage !== ''}
        autoHideDuration={3000}
        onClose={() => setSnackbarMessage('')}
        message={snackbarMessage}
      />

      {error && (
        <Typography variant="body1" color="error" style={{ margin: '1rem' }}>
          {error}
        </Typography>
      )}
    </div>
  );
};

export default App;
