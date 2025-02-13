import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { load } from 'cheerio';
import cron from 'node-cron';
dotenv.config();

async function main() {
	try {
		await handleScheduled({
			SUPABASE_URL: process.env.SUPABASE_URL,
			SUPABASE_KEY: process.env.SUPABASE_KEY,
		});
	} catch (error) {
		console.error('Error en la ejecución principal:', error);
	}
}

async function handleScheduled({ SUPABASE_URL, SUPABASE_KEY }) {
	const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
	const response = await fetch('https://ape.sena.edu.co/spe-web/spe/public/buscadorVacante?solicitudId=barrancabermeja', {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		},
	});

	if (!response.ok) return console.log('Error en la petición:', response.statusText, 'Status:', response.status);

	const html = await response.text();
	const $ = load(html);
	const rows = $('table tbody tr .row');

	const vacantes = [];
	rows.each((i, element) => {
		const vacante = extraerDatosVacante($, element);
		if (vacante.codigo) {
			vacantes.push(vacante);
		}
	});

	if (vacantes.length === 0) return;

	const { error: upsertError } = await supabase.from('vacantes').upsert(vacantes, {
		onConflict: ['codigo'],
		ignoreDuplicates: false,
	});

	if (upsertError) console.error('Error in batch upsert:', upsertError);

	const { data, error: selectError } = await supabase.from('vacantes').select('codigo, fecha_cierre, dias_restantes');

	if (selectError) console.error('Error in select:', selectError);

	const dias_restantes = data.map((vacante) => {
		return {
			codigo: vacante.codigo,
			dias_restantes: calcularDiasRestantes(vacante.fecha_cierre),
		};
	});

	const { error: upsertErrorDias } = await supabase.from('vacantes').upsert(dias_restantes, {
		onConflict: ['codigo'],
		ignoreDuplicates: false,
	});

	if (upsertErrorDias) console.error('Error in batch upsert:', upsertErrorDias);
}

function extraerDatosVacante($, element) {
	const container = $(element);
	const codigo = container.find('h4').first().text().trim();
	const cargo = container.find('h5').first().text().trim();
	const salario = container.find('h6').text().trim();

	const parrafos = container.find('div.span5 p');
	let experiencia = '';
	let tipoContrato = '';
	let teletrabajo = '';

	parrafos.each((_, el) => {
		const texto = $(el).text().trim();
		if (texto.toLowerCase().includes('experiencia')) {
			experiencia = texto;
		}
		if (texto.toLowerCase().includes('contrato')) {
			tipoContrato = texto.replace('Tipo de contrato:', '').trim();
		}
		if (texto.toLowerCase().includes('teletrabajo')) {
			teletrabajo = texto;
		}
	});

	const ubicacion = container.find('div.span5 p.titulo-color').text().trim();
	const vacantesText = container.find('div.span3 p:contains("Vacantes")').text();
	const numVacantes = vacantesText.match(/\d+/)?.[0] || '0';
	const postulacionesText = container.find('div.span3 p:contains("Postulaciones")').text();
	const numPostulaciones = postulacionesText.match(/\d+/)?.[0] || '0';
	const fechaPublicacionText = container.find('div.span3 p:contains("Publicado")').text();
	const fechaPublicacion = fechaPublicacionText.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '';
	const fechaCierreText = container.find('div.span3 p:contains("Fecha de cierre")').text();
	const fechaCierre = fechaCierreText.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '';
	const url = container.find('div.span1 a.btn-primary').attr('href').split(';')[0] || '';

	const diasRestantes = calcularDiasRestantes(convertToBogotatime(fechaCierre));

	return {
		codigo,
		cargo,
		salario,
		experiencia,
		tipo_contrato: tipoContrato,
		teletrabajo,
		ubicacion,
		num_vacantes: parseInt(numVacantes),
		num_postulaciones: parseInt(numPostulaciones),
		fecha_publicacion: convertToBogotatime(fechaPublicacion),
		fecha_cierre: convertToBogotatime(fechaCierre),
		dias_restantes: diasRestantes,
		url: 'https://ape.sena.edu.co' + url,
	};
}

function calcularDiasRestantes(fechaCierre) {
	const bogotaHoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
	bogotaHoy.setHours(0, 0, 0, 0);
	const fechaCierreDate = new Date(fechaCierre);
	return Math.floor((fechaCierreDate - bogotaHoy) / (1000 * 60 * 60 * 24));
}

function convertToBogotatime(dateStr) {
	const [day, month, year] = dateStr.split('/');
	return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00-05:00`).toISOString();
}

// Configurar el cron para ejecutar cada minuto
cron.schedule('*/10 * * * *', () => {
	console.log('Ejecutando tarea programada: ', new Date().toLocaleString());
	main();
});

main();
