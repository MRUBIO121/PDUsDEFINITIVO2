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
    '2. Rellena OBLIGATORIAMENTE la columna: rack_id (nombre del rack)',
    '3. La columna reason es opcional para especificar el motivo del mantenimiento',
    '4. El sistema buscará automáticamente los datos del rack en la API',
    '5. Si no encuentra el rack, lo agregará solo con el nombre proporcionado',
    '6. No modifiques el nombre de la columna (primera fila)',
    '7. No dejes filas vacías entre racks',
    '8. Máximo 1000 racks por archivo',
    '9. Guarda el archivo y súbelo en la aplicación',
  ];
  
  instructions.forEach((instruction, index) => {
    instructionsSheet.getCell(`A${5 + index}`).value = instruction;
  });
  
  instructionsSheet.getCell('A14').value = 'DESCRIPCIÓN DE COLUMNAS:';
  instructionsSheet.getCell('A14').font = { bold: true, size: 12 };
  
  const columns = [
    ['rack_id', 'OBLIGATORIO', 'Nombre del rack (el sistema buscará automáticamente el resto de datos)', 'RACK-001'],
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
    { header: 'rack_id', key: 'rack_id', width: 30 },
    { header: 'reason', key: 'reason', width: 50 }
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
    reason: 'Mantenimiento preventivo'
  });

  dataSheet.addRow({
    rack_id: 'RACK-002',
    reason: 'Mantenimiento preventivo'
  });

  dataSheet.addRow({
    rack_id: 'RACK-003',
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
  dataSheet.mergeCells('A5:B5');
  
  await workbook.xlsx.writeFile('plantilla_mantenimiento.xlsx');
  console.log('✅ Excel template created successfully in project root!');
}

createTemplate().catch(console.error);
