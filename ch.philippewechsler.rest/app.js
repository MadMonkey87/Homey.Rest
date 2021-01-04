'use strict';

const Homey = require('homey');

const http = require('http');
const https = require('https');
const urlParser = require('url');
const { util } = require('./util');
const fs = require('fs');

class AdvancedRestClient extends Homey.App {
  async onInit() {
    const certificateFolder = '/userdata/';
    this.log('Advanced Rest Client has been initialized');

    this.log('Listing certificate files...');
    fs.readdir(certificateFolder, (err, fileNames) => {
      if (fileNames) {
        fileNames.forEach(fileName => {
          this.log(fileName + '(' + util.getFileSizeInBytes(certificateFolder + fileName) + ' bytes)');
        });
      }
    });
    this.log('...done!');

    let requestCompletedTrigger = new Homey.FlowCardTrigger('request_completed').register();
    let requestFailedTrigger = new Homey.FlowCardTrigger('request_failed')
      .registerRunListener((args, state) => {
        return Promise.resolve(args.error === 'any' || args.error === state.error_code);
      })
      .register();

    let performRequestAction = new Homey.FlowCardAction('perform_request');
    performRequestAction
      .register()
      .registerRunListener(async (args, state) => {

        let url = urlParser.parse(args.url);
        let adapter = {};
        let port = url.port;

        const protocol = url.protocol.toLowerCase().replace('/', '').replace('.', '').replace(':', '')
        switch (protocol) {
          case 'http':
            adapter = http;
            if (!port) {
              port = 80;
            }
            break;
          case 'https':
            adapter = http;
            if (!port) {
              port = 443;
            }
            break;
          default:
            this.log('invalid protocol', url.protocol);
            Promise.resolve(false);
            break;
        }

        let headers = {};

        switch (args.bodytype) {
          case 'json':
            headers = {
              'Content-Type': 'application/json',
              'Content-Length': args.body.length
            }
            break;
          case 'xml':
            headers = {
              'Content-Type': 'application/xml',
              'Content-Length': args.body.length
            }
            break;
          case 'text':
            headers = {
              'Content-Type': 'text/html',
              'Content-Length': args.body.length
            }
            break;
          case 'js':
            headers = {
              'Content-Type': 'application/javascript',
              'Content-Length': args.body.length
            }
            break;
        }

        headers['User-Agent'] = 'ARC';

        let headerCollections = Homey.ManagerSettings.get('headerCollections');
        if (headerCollections == undefined || headerCollections === null) {
          headerCollections = [];
        }
        let customHeaders = [];
        for (var i = 0; i < headerCollections.length; i++) {
          if (headerCollections[i].id == args.headercollection.id) {
            customHeaders = headerCollections[i].headers;
          }
        }

        for (var i = 0; i < customHeaders.length; i++) {
          if (!util.hasOwnPropertyCaseInsensitive(headers, customHeaders[i].name)) {
            headers[customHeaders[i].name] = customHeaders[i].value;
          }
        }

        let options = {
          host: url.host,
          port: port,
          path: url.path,
          method: args.verb,
          rejectUnauthorized: false,
          headers: headers
        };

        if (args.certificate.certificateFileName != undefined) {
          try {
            const certificateFolder = '/userdata/';
            options.cert = fs.readFileSync(certificateFolder + args.certificate.certificateFileName);
            if (args.certificate.credential === 'keyfile') {
              options.key = fs.readFileSync(certificateFolder + args.certificate.keyFileName);
            } else {
              options.key = args.certificate.password;
            }
          } catch (error) {
            this.log('error while loading certificate ', error);
            requestFailedTrigger.trigger({ error_message: 'error while loading certificate: ' + error, error_code: '', request_url: args.url });
            return;
          }
        }

        this.log('performing request', args.url, options);

        return new Promise((resolve) => {
          https.request(options, (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
              data += chunk;
            });

            resp.on('end', () => {
              const tokens = { responde_code: resp.statusCode, body: data, headers: JSON.stringify(resp.headers), request_url: args.url };
              this.log('request completed ', tokens);
              requestCompletedTrigger.trigger(tokens);
              resolve(true);
            });

          }).on('error', (err) => {
            this.log("Error: " + JSON.stringify(err));

            let token = {
              error_message: '',
              error_code: err.data.code,
              request_url: args.url
            };

            if (err.data && err.data.message) {
              token.error_message = err.data.message;
            }

            requestFailedTrigger.trigger(token);

            resolve(false);
          }).write(args.body);
        });

      });

    performRequestAction.getArgument('headercollection')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let headerCollections = Homey.ManagerSettings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }
          headerCollections.unshift({ name: 'None', description: 'no customized headers' });
          resolve(headerCollections);
        });
      });

    performRequestAction.getArgument('certificate')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let certificates = Homey.ManagerSettings.get('certificates');
          if (certificates == undefined || certificates === null) {
            certificates = [];
          }
          certificates.unshift({ name: 'None', description: 'do not use a certificate' });
          resolve(certificates);
        });
      });

    let updateHeaderCollectionAction = new Homey.FlowCardAction('header_collection_add');
    updateHeaderCollectionAction
      .register()
      .registerRunListener(async (args, state) => {
        return new Promise((resolve) => {
          let headerCollections = Homey.ManagerSettings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }

          for (var i = 0; i < headerCollections.length; i++) {
            if (headerCollections[i].id == args.headercollection.id) {
              let headerCollection = headerCollections[i];
              let headers = headerCollection.headers;

              for (var j = 0; j < headers.length; j++) {
                if (headers[j].name.toLowerCase() === args.name.toLowerCase()) {
                  headers.splice(j, 1);
                  break;
                }
              }

              headers.push({ name: args.name, value: args.value });

              break;
            }
          }
          Homey.ManagerSettings.set('headerCollections', headerCollections);

          resolve(true)
        });
      })
      .getArgument('headercollection')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let headerCollections = Homey.ManagerSettings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }
          resolve(headerCollections);
        });
      });

    let removeHeaderCollectionItemAction = new Homey.FlowCardAction('header_collection_remove');
    removeHeaderCollectionItemAction
      .register()
      .registerRunListener(async (args, state) => {
        return new Promise((resolve) => {
          let headerCollections = Homey.ManagerSettings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }

          for (var i = 0; i < headerCollections.length; i++) {
            if (headerCollections[i].id == args.headercollection.id) {
              let headerCollection = headerCollections[i];
              let headers = headerCollection.headers;

              for (var j = 0; j < headers.length; j++) {
                if (headers[j].name.toLowerCase() === args.name.toLowerCase()) {
                  headers.splice(j, 1);
                  break;
                }
              }

              break;
            }
          }
          Homey.ManagerSettings.set('headerCollections', headerCollections);

          resolve(true)
        });
      })
      .getArgument('headercollection')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let headerCollections = Homey.ManagerSettings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }
          resolve(headerCollections);
        });
      });

  }

  addCertificate(args, callback) {
    this.log('add certificate');
    const certificateFolder = '/userdata/';
    let certificateForm = args.body;

    try {
      util.saveFile(certificateFolder, '', certificateForm.certificateFile, (error, success) => {
        if (error) {
          this.log('error persisting certificate', error);
          callback(error, null);
        } else {
          const certificateFileName = success.filename;
          this.log('persisted certificate', certificateFileName);
          if (certificateForm.credential == 'keyfile') {
            util.saveFile(certificateFolder, success.filename + '.', certificateForm.keyFile, (e, s) => {
              if (e) {
                this.log('error persisting key file', e);
                callback(e, null);
              } else {
                const keyFileName = s.filename;
                this.log('persisted key file', keyFileName);
                this.persistCertificate(certificateForm, certificateFileName, keyFileName, callback);
              }
            });
          } else {
            this.persistCertificate(certificateForm, certificateFileName, null, callback);
          }
        }
      });
    } catch (error) {
      this.log('Error while adding certificate', error);
      callback(error, null);
    }
  }

  persistCertificate(certificateForm, certificateFileName, keyFileName, callback) {
    const certificateFolder = '/userdata/';
    let certificates = Homey.ManagerSettings.get('certificates');
    if (certificates == undefined || certificates === null) {
      certificates = [];
    }

    let certificate = {
      name: certificateForm.name,
      size: util.getFileSizeInBytes(certificateFolder + certificateFileName),
      description: certificateForm.description,
      credential: certificateForm.credential,
      password: certificateForm.password,
      certificateFileName: certificateFileName,
      keyFileName: keyFileName
    };

    if (keyFileName != null) {
      certificate.keyFileSize = util.getFileSizeInBytes(certificateFolder + keyFileName);
    }

    certificates.push(certificate);
    Homey.ManagerSettings.set('certificates', certificates);

    callback(null, 'success');
  }

  removeCertificate(args, callback) {
    this.log('remove certificate ', args.query.hash);
    const certificateFolder = '/userdata/';
    let certificates = Homey.ManagerSettings.get('certificates');
    if (certificates == undefined || certificates === null) {
      certificates = [];
    }

    for (var i = 0; i < certificates.length; i++) {
      if (certificates[i].certificateFileName === args.query.hash) {

        if (fs.existsSync(certificateFolder + certificates[i].certificateFileName)) {
          this.log('removed file ', certificateFolder + certificates[i].certificateFileName);
          fs.unlinkSync(certificateFolder + certificates[i].certificateFileName);
        }

        if (certificates[i].credential == 'keyfile' && fs.existsSync(certificateFolder + certificates[i].keyFileName)) {
          this.log('removed file ', certificateFolder + certificates[i].keyFileName);
          fs.unlinkSync(certificateFolder + certificates[i].keyFileName);
        }

        certificates.splice(i, 1);
        Homey.ManagerSettings.set('certificates', certificates);

        this.log('removed certificate ', args.query.hash);

        callback(null, 'success');
      }
    }

    callback('Certificate not found', null);
  }

}

module.exports = AdvancedRestClient;