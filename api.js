const Homey = require('homey')

module.exports = [
	{
		method: 'POST',
		path: '/certificate',
		public: false,
		fn: function (args, callback) {
			Homey.app.addCertificate(args, (err, result) => {
				if (err) {
					callback(err, null)
				} else {
					callback(null, result)
				}
			})
		}
	},
]