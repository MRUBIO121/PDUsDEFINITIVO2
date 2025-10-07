const ExcelJS = require('exceljs');

async function createTemplate() {
  const workbook = new ExcelJS.Workbook();
  
  // Sheet 1: Instructions
  const instructionsSheet = workbook.addWorksheet('Instrucciones');
  
  instructionsSheet.getCell('A1').value = 'PLANTILLA DE IMPORTACIÓN MASIVA DE RACKS A MANTENIMIENTO';
  instructionsSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0066CC' } };
  
  instructionsSheet.getCell('A3').value = 'INSTRUCCIONES:';
  instructionsSheet.getCell('A3').font = { bold: true, size: 12 };
  
  const instructions = [
    '1. Ve a la pestaña "Datos" para rellenar la información de los racks',
    '2. Rellena OBLIGATORIAMENTE las columnas: rack_id y dc',
    '3. Las demás columnas son opcionales pero recomendadas',
    '4. No modifiques los nombres de las columnas (primera fila)',
    '5. No dejes filas vacías entre racks',
    '6. Máximo 1000 racks por archivo',
    '7. Guarda el archivo y súbelo en la aplicación',
  ];
  
  instructions.forEach((instruction, index) => {
    instructionsSheet.getCell(`A${5 + index}`).value = instruction;
  });
  
  instructionsSheet.getCell('A14').value = 'DESCRIPCIÓN DE COLUMNAS:';
  instructionsSheet.getCell('A14').font = { bold: true, size: 12 };
  
  const columns = [
    ['rack_id', 'OBLIGATORIO', 'ID único del rack', 'RACK-001'],
    ['dc', 'OBLIGATORIO', 'Data center', 'DC-01'],
    ['chain', 'Opcional', 'Número de chain', 'CHAIN-A'],
    ['pdu_id', 'Opcional', 'ID del PDU', 'PDU-001'],
    ['name', 'Opcional', 'Nombre descriptivo', 'Rack Principal Norte'],
    ['country', 'Opcional', 'País', 'España'],
    ['site', 'Opcional', 'Sitio', 'Site-North'],
    ['phase', 'Opcional', 'Fase', 'Fase-A'],
    ['node', 'Opcional', 'Nodo', 'Node-01'],
    ['serial', 'Opcional', 'Número de serie', 'SN123456789'],
    ['reason', 'Opcional', 'Razón del mantenimiento', 'Mantenimiento preventivo'],
  ];
  
  instructionsSheet.getCell('A16').value = 'Columna';
  instructionsSheet.getCell('B16').value = 'Obligatorio';
  instructionsSheet.getCell('C16').value = 'Descripción';
  instructionsSheet.getCell('D16').value = 'Ejemplo';
  instructionsSheet.getRow(16).font = { bold: true };
  
  columns.forEach((col, index) => {
    const row = 17 + index;
    instructionsSheet.getCell(`A${row}`).value = col[0];
    instructionsSheet.getCell(`B${row}`).value = col[1];
    instructionsSheet.getCell(`C${row}`).value = col[2];
    instructionsSheet.getCell(`D${row}`).value = col[3];
  });
  
  instructionsSheet.columns = [
    { width: 20 },
    { width: 15 },
    { width: 35 },
    { width: 30 }
  ];
  
  // Sheet 2: Data
  const dataSheet = workbook.addWorksheet('Datos');
  
  dataSheet.columns = [
    { header: 'rack_id', key: 'rack_id', width: 20 },
    { header: 'dc', key: 'dc', width: 15 },
    { header: 'chain', key: 'chain', width: 15 },
    { header: 'pdu_id', key: 'pdu_id', width: 20 },
    { header: 'name', key: 'name', width: 30 },
    { header: 'country', key: 'country', width: 15 },
    { header: 'site', key: 'site', width: 20 },
    { header: 'phase', key: 'phase', width: 15 },
    { header: 'node', key: 'node', width: 15 },
    { header: 'serial', key: 'serial', width: 20 },
    { header: 'reason', key: 'reason', width: 35 }
  ];
  
  // Style header row
  dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  dataSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0066CC' }
  };
  dataSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Add example rows
  dataSheet.addRow({
    rack_id: 'RACK-001',
    dc: 'DC-01',
    chain: 'CHAIN-A',
    pdu_id: 'PDU-001',
    name: 'Rack Principal Norte',
    country: 'España',
    site: 'Site-North',
    phase: 'Fase-A',
    node: 'Node-01',
    serial: 'SN123456789',
    reason: 'Mantenimiento preventivo'
  });
  
  dataSheet.addRow({
    rack_id: 'RACK-002',
    dc: 'DC-01',
    chain: 'CHAIN-A',
    pdu_id: 'PDU-002',
    name: 'Rack Norte 2',
    country: 'España',
    site: 'Site-North',
    phase: 'Fase-A',
    node: 'Node-02',
    serial: 'SN123457',
    reason: 'Mantenimiento preventivo'
  });
  
  dataSheet.addRow({
    rack_id: 'RACK-003',
    dc: 'DC-02',
    chain: 'CHAIN-B',
    pdu_id: '',
    name: '',
    country: '',
    site: '',
    phase: '',
    node: '',
    serial: '',
    reason: 'Reparación urgente'
  });
  
  // Style example rows with light yellow
  [2, 3, 4].forEach(rowNum => {
    dataSheet.getRow(rowNum).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFACD' }
    };
  });
  
  // Add note
  dataSheet.getCell('A5').value = 'NOTA: Las filas 2-4 son ejemplos. Bórralas y añade tus datos debajo.';
  dataSheet.getCell('A5').font = { italic: true, color: { argb: 'FFFF0000' } };
  dataSheet.mergeCells('A5:K5');
  
  await workbook.xlsx.writeFile('/tmp/cc-agent/55592644/project/public/plantilla_mantenimiento.xlsx');
  console.log('✅ Excel template created successfully!');
}

createTemplate().catch(console.error);
