module.exports = {
	async addCertificate({ homey, params, query, body }) {
		homey.app.addCertificate(body, (err, result) => {
			return {
				success: err == null,
				error: err,
				result: result
			};
		})
	},
	async removeCertificate({ homey, params, query, body }) {
		homey.app.removeCertificate(query, (err, result) => {
			return {
				success: err == null,
				error: err,
				result: result
			};
		})
	},
}