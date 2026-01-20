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
    '1. Ve a la pestana "Datos" para rellenar la informacion de los racks',
    '2. Rellena OBLIGATORIAMENTE la columna: rackName (nombre del rack)',
    '3. La columna reason es opcional para especificar el motivo del mantenimiento',
    '4. El sistema buscara automaticamente los datos del rack en la API',
    '5. Si no encuentra el rack, lo agregara solo con el nombre proporcionado',
    '6. No modifiques el nombre de la columna (primera fila)',
    '7. No dejes filas vacias entre racks',
    '8. Maximo 1000 racks por archivo',
    '9. Guarda el archivo y subelo en la aplicacion',
    '10. IMPORTANTE: Borra las filas de ejemplo (RACK-001, RACK-002, RACK-003) antes de agregar tus datos',
  ];
  
  instructions.forEach((instruction, index) => {
    instructionsSheet.getCell(`A${5 + index}`).value = instruction;
  });
  
  instructionsSheet.getCell('A14').value = 'DESCRIPCIÓN DE COLUMNAS:';
  instructionsSheet.getCell('A14').font = { bold: true, size: 12 };
  
  const columns = [
    ['rackName', 'OBLIGATORIO', 'Nombre del rack (el sistema buscara automaticamente el resto de datos)', 'RACK-001'],
    ['reason', 'Opcional', 'Razon del mantenimiento', 'Mantenimiento preventivo'],
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
    { header: 'rackName', key: 'rackName', width: 30 },
    { header: 'reason', key: 'reason', width: 50 }
  ];

  dataSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  dataSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0066CC' }
  };
  dataSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  dataSheet.addRow({
    rackName: 'RACK-001',
    reason: 'Mantenimiento preventivo'
  });

  dataSheet.addRow({
    rackName: 'RACK-002',
    reason: 'Mantenimiento preventivo'
  });

  dataSheet.addRow({
    rackName: 'RACK-003',
    reason: 'Reparacion urgente'
  });
  
  // Style example rows with light yellow
  [2, 3, 4].forEach(rowNum => {
    dataSheet.getRow(rowNum).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFACD' }
    };
  });
  
  await workbook.xlsx.writeFile('plantilla_mantenimiento.xlsx');
  console.log('✅ Excel template created successfully in project root!');
}

createTemplate().catch(console.error);
