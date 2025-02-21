const config = {
	botToken: process.env.BOT_TOKEN ?? '8170764448:AAHmRLX7dRKFgjbGHlAvcB47rB3VTyTpG_o',
	groupId: process.env.GROUP_ID ?? '-1002319350387',
};

const sendTelegramMessage = async (message) => {
	try {
		// Construir la URL con formato query string
		const baseUrl = 'https://api.telegram.org';
		const url = `${baseUrl}/bot${config.botToken}/sendMessage?chat_id=${config.groupId}&parse_mode=HTML&text=${encodeURIComponent(
			message
		)}`;

		// Usar fetch en lugar de axios
		const response = await fetch(url);
		const data = await response.json();

		return data;
	} catch (error) {
		console.error('Error al enviar mensaje a Telegram:', error.message);
		throw new Error(`Error al enviar mensaje: ${error.message}`);
	}
};

// Exportación ES6
export default sendTelegramMessage;
