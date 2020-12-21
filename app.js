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

        this.log('options', options)

        return new Promise((resolve) => {
          https.request(options, (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
              data += chunk;
            });

            resp.on('end', () => {
              requestCompletedTrigger.trigger({ responde_code: resp.statusCode, body: data, headers: JSON.stringify(resp.headers), request_url: url });
              resolve(true);
            });

          }).on('error', (err) => {
            console.log("Error: " + JSON.stringify(err));
            requestFailedTrigger.trigger({ error_message: err.data.message, error_code: err.data.code, request_url: args.url });
            resolve(false);
          }).write(args.body)
        });

      })
      .getArgument('headercollection')
      .registerAutocompleteListener((query, args) => {
        return new Promise((resolve) => {
          let headerCollections = Homey.ManagerSettings.get('headerCollections');
          if (headerCollections == undefined || headerCollections === null) {
            headerCollections = [];
          }
          headerCollections.unshift({ name: 'Default', description: 'no customized headers' });
          resolve(headerCollections);
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

    this.log(certificateFolder + args.body.name);

    util.saveFile(certificateFolder + args.body.name, args.body.certificateFile, () => {
      this.log('Listing certificate files...');
      fs.readdir(certificateFolder, (err, fileNames) => {
        if (fileNames) {
          fileNames.forEach(fileName => {
            this.log(fileName + '(' + util.getFileSizeInBytes(certificateFolder + fileName) + ' bytes)');
          });
        }
      });
      this.log('...done!');

      callback(null, 'success');
    });



  }
}

module.exports = AdvancedRestClient;