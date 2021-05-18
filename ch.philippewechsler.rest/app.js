'use strict';

const Homey = require('homey');

const http = require('http');
const https = require('https');
const urlParser = require('url');
const { util } = require('./util');
const fs = require('fs');
const { JSONPath } = require('jsonpath-plus');

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

    const requestCompletedTrigger = this.homey.flow.getTriggerCard('request_completed');

    const requestFailedTrigger = this.homey.flow.getTriggerCard('request_failed');

    let analyseJsonCondition = this.homey.flow.getConditionCard('analyse_json');
    analyseJsonCondition
      .registerRunListener((args, state) => {
        return new Promise((resolve) => {
          const result = JSONPath({ path: args.path, json: JSON.parse(args.json) });
          resolve(JSON.stringify(result) === args.expected_result);
        });
      });

    const performRequestAction = this.homey.flow.getActionCard('perform_request');
    performRequestAction.registerRunListener(async (args, state) => {

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
          adapter = https;
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

      let headerCollections = this.homey.settings.get('headerCollections');
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

      if (args.certificate.certificateFileName != undefined && protocol == 'https') {
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

      return new Promise((resolve, reject) => {
        try {
          adapter.request(options, (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
              data += chunk;
            });

            resp.on('end', () => {
              const tokens = { responde_code: resp.statusCode, body: data, headers: JSON.stringify(resp.headers), request_url: args.url };
              this.log('request completed ', tokens);
              requestCompletedTrigger.trigger(tokens);
              resolve();
            });

          }).on('error', (err) => {
            this.log("Error: " + JSON.stringify(err));

            let token = {
              error_message: '',
              error_code: '',
              request_url: args.url
            };

            if (err.data && err.data.message) {
              token.error_message = err.data.message;
            }

            if (err.data && err.data.code) {
              token.error_code = err.data.code;
            }

            requestFailedTrigger.trigger(token);
            reject();
          }).write(args.body);

        } catch (error) {
          this.log('unhandled error', error);

          const token = {
            error_message: 'internal error',
            error_code: '',
            request_url: args.url
          };

          requestFailedTrigger.trigger(token);
          reject();
        }
      });
    });

    performRequestAction.getArgument('headercollection')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let headerCollections = this.homey.settings.get('headerCollections');
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
          let certificates = this.homey.settings.get('certificates');
          if (certificates == undefined || certificates === null) {
            certificates = [];
          }
          certificates.unshift({ name: 'None', description: 'do not use a certificate' });
          resolve(certificates);
        });
      });

    let updateHeaderCollectionAction = this.homey.flow.getActionCard('header_collection_add');
    updateHeaderCollectionAction
      .registerRunListener(async (args, state) => {
        return new Promise((resolve) => {
          let headerCollections = this.homey.settings.get('headerCollections');
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
          this.homey.settings.set('headerCollections', headerCollections);

          resolve(true)
        });
      })
      .getArgument('headercollection')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let headerCollections = this.homey.settings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }
          resolve(headerCollections);
        });
      });

    let removeHeaderCollectionItemAction = this.homey.flow.getActionCard('header_collection_remove');
    removeHeaderCollectionItemAction
      .registerRunListener(async (args, state) => {
        return new Promise((resolve) => {
          let headerCollections = this.homey.settings.get('headerCollections');
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
          this.homey.settings.set('headerCollections', headerCollections);

          resolve(true)
        });
      })
      .getArgument('headercollection')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let headerCollections = Homey.settings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }
          resolve(headerCollections);
        });
      });

  }

  addCertificate(body, callback) {
    this.log('add certificate');
    const certificateFolder = '/userdata/';
    let certificateForm = body;

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
    let certificates = this.homey.settings.get('certificates');
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
    this.homey.settings.set('certificates', certificates);

    callback(null, 'success');
  }

  removeCertificate(query, callback) {
    this.log('remove certificate ', query.hash);
    const certificateFolder = '/userdata/';
    let certificates = this.homey.settings.get('certificates');
    if (certificates == undefined || certificates === null) {
      certificates = [];
    }

    for (var i = 0; i < certificates.length; i++) {
      if (certificates[i].certificateFileName === query.hash) {

        if (fs.existsSync(certificateFolder + certificates[i].certificateFileName)) {
          this.log('removed file ', certificateFolder + certificates[i].certificateFileName);
          fs.unlinkSync(certificateFolder + certificates[i].certificateFileName);
        }

        if (certificates[i].credential == 'keyfile' && fs.existsSync(certificateFolder + certificates[i].keyFileName)) {
          this.log('removed file ', certificateFolder + certificates[i].keyFileName);
          fs.unlinkSync(certificateFolder + certificates[i].keyFileName);
        }

        certificates.splice(i, 1);
        this.homey.settings.set('certificates', certificates);

        this.log('removed certificate ', query.hash);

        callback(null, 'success');
      }
    }

    callback('Certificate not found', null);
  }

}

module.exports = AdvancedRestClient;