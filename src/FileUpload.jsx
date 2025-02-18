import React, { useState } from 'react';

function FileUpload({ onFileSelect }) {
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
  };

  const handleUpload = () => {
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const jsonData = JSON.parse(event.target.result);
          onFileSelect(jsonData); // Übergabe der JSON-Daten an die übergeordnete Komponente
        } catch (error) {
          console.error('Ungültige JSON-Datei:', error);
          alert('Bitte wähle eine gültige JSON-Datei aus.');
        }
      };
      reader.readAsText(selectedFile);
    }
  };

  return (
    <div>
      <input type="file" accept=".json" onChange={handleFileChange} />
      <button onClick={handleUpload} disabled={!selectedFile}>Hochladen</button>
    </div>
  );
}

export default FileUpload;