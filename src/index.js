import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';

export default {
	async fetch(request, env, ctx) {
		const vacantes = await handleScheduled(env);
		return new Response(JSON.stringify(vacantes, null, 2), {
			headers: { 'Content-Type': 'application/json' },
		});
	},

	async scheduled(event, env, ctx) {
		ctx.waitUntil(await handleScheduled(env));
	},
};

async function handleScheduled(env) {
	try {
		const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
		const response = await fetch('https://ape.sena.edu.co/spe-web/spe/public/buscadorVacante?solicitudId=barrancabermeja', {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			},
		});

		const html = await response.text();
		const $ = cheerio.load(html);
		const rows = $('table tbody tr .row');

		const vacantes = [];
		rows.each((i, element) => {
			const vacante = extraerDatosVacante($, element);
			if (vacante.codigo) {
				vacantes.push(vacante);
			}
		});

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

		return vacantes;
	} catch (error) {
		console.error('Error in handleScheduled:', error);
		throw error;
	}
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

	parrafos.each((i, el) => {
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
