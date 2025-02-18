import React, { useState, useEffect } from 'react';
import initSqlJs from 'sql.js';

let dbInstance = null;
const DB_NAME = 'SqliteStorage';
const STORE_NAME = 'sqliteDB';
const DB_KEY = 'database';

// IndexedDB Hilfsfunktionen
const openIndexedDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

const saveToIndexedDB = async (sqliteDB) => {
  try {
    const data = sqliteDB.export();
    const indexedDB = await openIndexedDB();
    
    return new Promise((resolve, reject) => {
      const transaction = indexedDB.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data, DB_KEY);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to save to IndexedDB:', error);
    throw error;
  }
};

const loadFromIndexedDB = async () => {
  try {
    const indexedDB = await openIndexedDB();
    
    return new Promise((resolve, reject) => {
      const transaction = indexedDB.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(DB_KEY);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load from IndexedDB:', error);
    throw error;
  }
};

const clearIndexedDB = async () => {
  try {
    const indexedDB = await openIndexedDB();
    
    return new Promise((resolve, reject) => {
      const transaction = indexedDB.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(DB_KEY);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to clear IndexedDB:', error);
    throw error;
  }
};

// SQLite Initialisierung mit IndexedDB-Persistenz
const initializeDB = async () => {
  if (!dbInstance) {
    try {
      const SQL = await initSqlJs({ locateFile: file => `/sql-wasm.wasm` });
      
      // Versuche, existierende Daten aus IndexedDB zu laden
      const savedData = await loadFromIndexedDB();
      
      if (savedData) {
        dbInstance = new SQL.Database(savedData);
      } else {
        dbInstance = new SQL.Database();
        await createTable(dbInstance);
      }
      
      return dbInstance;
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw new Error('Failed to initialize database');
    }
  }
  return dbInstance;
};

const createTable = async (db) => {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS testData (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        value TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await saveToIndexedDB(db);
  } catch (error) {
    console.error('Table creation failed:', error);
    throw new Error('Failed to create table');
  }
};

const saveData = async (value) => {
  try {
    const db = await initializeDB();
    const timestamp = new Date().toISOString();
    db.run("INSERT INTO testData (value, timestamp) VALUES (?, ?)", [value, timestamp]);
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
    const result = db.exec("SELECT value, timestamp FROM testData ORDER BY timestamp DESC LIMIT 5");
    if (result && result[0] && result[0].values) {
      return result[0].values.map(row => ({
        value: row[0],
        timestamp: row[1]
      }));
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

const DatabasePersistenceTest = () => {
  const [inputValue, setInputValue] = useState('');
  const [savedValues, setSavedValues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await loadData();
      setSavedValues(data);
    } catch (err) {
      setError(err.message);
      console.error('Load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!inputValue.trim()) return;
    
    try {
      setIsSaving(true);
      setError(null);
      await saveData(inputValue);
      setInputValue('');
      await loadInitialData();
    } catch (err) {
      setError(err.message);
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      setIsLoading(true);
      setError(null);
      await clearAllData();
      setSavedValues([]);
    } catch (err) {
      setError(err.message);
      console.error('Clear error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 border rounded-lg shadow-sm">
      <h1 className="text-2xl font-bold mb-4">SQLite Database Test (with IndexedDB)</h1>
      
      <div className="space-y-4">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 px-3 py-2 border rounded"
            placeholder="Enter a value to store"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isSaving}
          />
          <button 
            onClick={handleSave} 
            disabled={!inputValue.trim() || isSaving}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button 
            onClick={handleClear}
            disabled={isLoading || savedValues.length === 0}
            className="px-4 py-2 bg-red-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear All
          </button>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Stored Values</h3>
          {isLoading ? (
            <div className="text-center py-4">Loading...</div>
          ) : savedValues.length > 0 ? (
            <div className="space-y-2">
              {savedValues.map((item, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded">
                  <div className="font-medium">{item.value}</div>
                  <div className="text-sm text-gray-500">
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">No values stored yet</p>
          )}
        </div>

        <p className="text-sm text-gray-500 mt-4">
          Data is now persisted in IndexedDB. Values will remain after page refresh.
        </p>
      </div>
    </div>
  );
};

export default DatabasePersistenceTest;