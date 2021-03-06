# Advanced Rest Client (ARC) for Homey
Advanced Rest Client (ARC) for [Athom Homey](https://homey.app/en-us/)
[![current version](https://img.shields.io/badge/version-2.0.0-<COLOR>.svg)](https://shields.io/)

# Introduction
Provides some flow cards that allows you to perform some http(s) requests with advanced features. This can be used to access cloud services or local devices.

# Features
 - Use custom request headers
 - Perform requests with a custom certificate
 - Advanced response handling, i.e reading data from JSON/XML, response headers or server validation (JSONPath & XPath)
 - Authorize the request (OAuth, JSON web token, bearer token, basic authentication) (coming soon)

# Usage
 - First create a "perform a request" action flow card. You can setup most things here like the url or the payload
 - If you need to handle the response you can setup a new flow using the "a request has completed" trigger card
 - You can define custom headers or certificates in the app configuration and then select them in the flow card