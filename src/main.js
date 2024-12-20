import plugin from '../plugin.json';

import { GoogleGenerativeAI } from '@google/generative-ai';
import markdownit from 'markdown-it';
import OpenAI from 'openai';

const SideButton = acode.require('sideButton');
const Prompt = acode.require('prompt');
const MultiPrompt = acode.require('multiPrompt');
const Select = acode.require('select');
const selectionMenu = acode.require('selectionMenu');
const appSettings = acode.require('settings')
const alert = acode.require('alert')

const Settings = {
   PROVIDER: 'provider',
   GEMINI_API_KEY: 'geminiApikey',
   OPENAI_API_KEY: 'openaiApikey',

   DEFAULT: {
      provider: '',
      geminiApikey: '',
      openaiApikey: ''
   }
};

const Providers = {
   OPENAI: 'openai',
   GEMINI: 'gemini'
}

class GenerateCode {

   #commands = [
      {
         name: 'generate_code',
         description: 'Generate Code',
         exec: this.run.bind(this),
      },
      {
         name: 'hide_generate_code_btn',
         description: 'Hide the generate code button',
         exec: () => this.sideButton.hide()
      },
      {
         name: 'show_generate_code_btn',
         description: 'Show the generate code button',
         exec: () => this.sideButton.show()
      },
      {
         name: 'generate_code_update_token',
         description: 'Update Provider Token (Generate Code)',
         exec: this.updateApiKey.bind(this),
      }
   ]

   constructor() {
      if (!appSettings.value[plugin.id]) {
         appSettings.value[plugin.id] = Settings.DEFAULT;
         appSettings.update();
      }
   }

   setupCommands() {
      this.#commands.forEach(cmd => {
         console.log('register command: ' + cmd.name);
         editorManager.editor.commands.addCommand(cmd);
      })
   }

   clearCommands() {
      this.#commands.forEach(cmd => {
         console.log('remove command: ' + cmd.name);
         editorManager.editor.commands.removeCommand(cmd.name);
      })
   }

   async init() {
      this.$markdownItFile = tag("script", {
         src: this.baseUrl + "assets/markdown-it.min.js"
      });

      this.$pencilIcon = tag('img', {
         className: 'edit-text-generate-token',
         src: this.baseUrl + 'assets/pencil-icon.svg'
      })

      // add markdownit files
      document.head.append(this.$markdownItFile);
      // setup commands
      this.setupCommands();
      // side button
      this.sideButton = SideButton({
         text: 'Generate Code',
         icon: 'generate-code-icon',
         onclick: () => this.run(),
         backgroundColor: '#8400ff',
         textColor: '#000'
      });
      // show the side button
      this.sideButton.show();
      // add pencilicon to selection menu
      selectionMenu.add(this.transformSelectedCode.bind(this), this.$pencilIcon, 'all');
   }

   get mdIt() {
      const md = markdownit()
      return window.markdownit({
         html: false,
         xhtmlOut: false,
         breaks: false,
         linkify: false,
         typographer: false,
         quotes: '“”‘’',
         highlight: function (str) { editorManager.editor.insert(str) }
      });
   }

   /**
    * 
    * @param {string} apikey 
    * @param {string} message 
    * 
    */
   async generateCodeGemini(apikey, message) {
      try {
         const genAI = new GoogleGenerativeAI(apikey)
         const prompt = `Language: ${this.getCurrentModeName}\n${message}`
         const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
               temperature: 0
            }
         })
         const result = await model.generateContent(prompt)
         this.mdIt.render(result.response.text())
         // const result = await model.generateContentStream(prompt)
         // for await (const chunk of result.stream) {
         //    const chunkText = chunk.text()
         //    this.mdIt.render(chunkText)
         // }
      } catch (error) { this.handleError(error, 'Generate Code Error') }
   }

   /**
    * 
    * @param {string} apikey 
    * @param {string} message 
    */
   async generateCodeOpenai(apikey, message) {
      try {
         const openai = new OpenAI({
            apiKey: apikey,
            dangerouslyAllowBrowser: true
         })

         const response = openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
               { role: 'system', content: 'You are ChatGPT, a large language model trained by OpenAI.' },
               { role: 'user', content: `Language: ${this.getCurrentModeName}` },
               { role: 'user', content: message }
            ],
            temperature: 0
         })
         const result = (await response).choices[0].message.content;
         this.mdIt.render(result);
      } catch (error) { this.handleError(error, 'Generate Code Error') }
   }

   /**
    * 
    * @returns {Promise<String?>}
    */
   async getApiKey() {
      const provider = this.settings.provider;
      let apikey = null;
      if (provider == Providers.OPENAI) {
         apikey = this.settings.openaiApikey;
      } else if (provider == Providers.GEMINI) {
         apikey = this.settings.geminiApikey;
      }

      if (apikey == null || apikey == '') {
         let newApiKey = await MultiPrompt(
            `${provider} api key`,
            [{
               type: 'text',
               id: 'apikey',
               required: true,
               placeholder: `Enter your ${provider} api key`
            }],
            'https://platform.openai.com/api-keys'
         )
         console.log("getApiKey(" + newApiKey['apikey'] + ")");
         apikey = newApiKey['apikey'];
         this.updateSetting(provider == Providers.OPENAI ? Settings.OPENAI_API_KEY : Settings.GEMINI_API_KEY, apikey);
      }

      return apikey;
   }

   async transformSelectedCode() {
      try {
         const { editor } = editorManager;
         let selectedText = editor.session.getTextRange(editor.getSelectionRange());
         if (!selectedText) return;

         let provider = this.settings.provider;
         if (!provider) {
            const options = [
               ["openai", 'Openai', '', true],
               ["gemini", 'Gemini', '', true],
            ];
            const selectedProvider = await Select("Select Provider", options, {
               onCancel: () => { },
               hideOnSelect: true,
            })
            provider = selectedProvider;
            this.updateSetting(Settings.PROVIDER, selectedProvider);
         }

         const apikey = await this.getApiKey();
         if (!apikey) {
            throw new Error('Apikey is not valid or empty')
         };

         const userPromt = await Prompt(`Transfrom Selected Code (${provider})`, '', 'text', {
            placeholder: 'Enter a command to generate code',
            require: true
         });
         if (!userPromt) {
            return;
         }
         const message = `${userPromt}\n${selectedText}`;

         if (provider == Providers.OPENAI) {
            this.generateCodeOpenai(apikey, message)
         } else if (provider == Providers.GEMINI) {
            this.generateCodeGemini(apikey, message)
         } else {
            throw new TypeError('Provider not supported')
         }
      } catch (error) { this.handleError(error) }
   }

   async run() {
      let provider = this.settings.provider;

      if (!provider) {
         const options = [
            ["openai", 'Openai', '', true],
            ["gemini", 'Gemini', '', true],
         ];
         const selectedProvider = await Select("Select Provider", options, {
            onCancel: () => { },
            hideOnSelect: true,
         })
         provider = selectedProvider;
         this.updateSetting(Settings.PROVIDER, selectedProvider);
      }

      try {
         const apikey = await this.getApiKey();
         if (!apikey) {
            throw new Error('Apikey is not valid or empty!')
         }

         const message = await Prompt(`Generate Code (${provider})`, '', 'text', {
            placeholder: 'Enter a command to generate a code...',
            required: true
         });
         if (!message) {
            return;
         }

         if (provider == Providers.OPENAI) {
            this.generateCodeOpenai(apikey, message)
         } else if (provider == Providers.GEMINI) {
            this.generateCodeGemini(apikey, message)
         } else {
            throw new TypeError('Provider not supported')
         }
      } catch (error) { this.handleError(error) }
   }

   async updateApiKey() {
      const provider = this.settings.provider;
      let newApiKey = await MultiPrompt(
         `${provider} Api Key`,
         [{
            type: 'text',
            id: 'apikey',
            required: true,
            placeholder: `Enter your ${provider} api key`
         }],
         'https://platform.openai.com/api-keys'
      )

      this.updateSetting(
         provider == Providers.OPENAI ? Settings.OPENAI_API_KEY : Settings.GEMINI_API_KEY,
         newApiKey['apikey']
      );
      window.toast('Api Key Update.', 3000);
   }

   updateSetting(key, newValue) {
      this.settings[key] = newValue;
      appSettings.update();
   }

   get settings() {
      return appSettings.value[plugin.id];
   }

   get settingsObj() {
      const settings = this.settings;
      return {
         list: [
            {
               key: Settings.PROVIDER,
               text: "Provider",
               info: 'Provider Generate Code.',
               value: settings.provider,
               select: [
                  ["openai", "Openai"],
                  ["gemini", "gemini"]
               ]
            },
            {
               key: Settings.OPENAI_API_KEY,
               text: 'Openai Api Key',
               info: 'The Api Key to used generate code.',
               value: this.settings.openaiApikey,
               prompt: 'Openai Api Key',
               promptType: 'text',
               promptOption: [{ require: true }]
            },
            {
               key: Settings.GEMINI_API_KEY,
               text: 'Gemini Api Key',
               info: 'The Api Key to used generate code.',
               value: this.settings.geminiApikey,
               prompt: 'Gemini Api Key',
               promptType: 'text',
               promptOption: [{ require: true }]
            },
         ],
         cb: (key, value) => {
            this.settings[key] = value
            appSettings.update()
         }
      }
   }

   /**
    * 
    * @param {any} error 
    * @param {string?} title 
    */
   handleError(error, title) {
      if (error) {
         alert(title || 'Error', error.message)
      }
   }

   get getCurrentModeName() {
      const { editor } = editorManager;
      const session = editor.getSession();
      const currentMode = session.getMode();
      const currentModeName = currentMode.$id.split('/'); // [ace, mode, javascript]
      return currentModeName[currentModeName.length - 1];
   }

   async destroy() {
      this.clearCommands();
      delete appSettings.value[plugin.id];
      appSettings.update(false)

      this.$markdownItFile.remove();
      this.$pencilIcon.remove();
   }

}

if (window.acode) {
   const acodePlugin = new GenerateCode();
   acode.setPluginInit(
      plugin.id,
      (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
         if (!baseUrl.endsWith("/")) {
            baseUrl += "/";
         }
         acodePlugin.baseUrl = baseUrl;
         acodePlugin.init($page, cacheFile, cacheFileUrl);
      },
      acodePlugin.settingsObj
   );
   acode.setPluginUnmount(plugin.id, () => {
      acodePlugin.destroy();
   });
}