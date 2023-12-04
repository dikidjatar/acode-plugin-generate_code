import plugin from '../plugin.json';

import { Configuration, OpenAIApi } from 'openai';

const SideButton = acode.require('sideButton');
const prompt = acode.require('prompt');
const multiPrompt = acode.require('multiPrompt');
const selectionMenu = acode.require('selectionMenu');

class GenerateCode {
  
  async init() {
    
    this.$markdownItFile = tag("script", {
      src: this.baseUrl + "assets/markdown-it.min.js"
    });

    this.$pencilIcon = tag('img', {
      className: 'edit-text-generate-token',
      src: this.baseUrl + 'assets/pencil-icon.svg'
    })
    
    document.head.append(this.$markdownItFile);

    // Command
    editorManager.editor.commands.addCommand({
      name: 'generate_code',
      description: 'Generate Code',
      exec: this.run.bind(this),
    });

    editorManager.editor.commands.addCommand({
      name: 'hide_generate_code_btn',
      description: 'Hide the generate code button',
      exec: () => this.sideButton.hide()
    });
    
    editorManager.editor.commands.addCommand({
      name: 'show_generate_code_btn',
      description: 'Show the generate code button',
      exec: () => this.sideButton.show()
    });

    editorManager.editor.commands.addCommand({
      name: 'generate_code_update_token',
      description: 'Update Openai Token (Generate Code)',
      exec: this.updateToken.bind(this),
    });

    this.sideButton = SideButton({
      text: 'Generate Code',
      icon: 'generate-code-icon',
      onclick: () => this.run(),
      backgroundColor: '#8400ff',
      textColor: '#000'
    });

    this.sideButton.show();
    selectionMenu.add(this.editCode.bind(this), this.$pencilIcon, 'all');
  }

  async editCode() {
    const { editor } = editorManager;
    let selectedText = editor.session.getTextRange(editor.getSelectionRange());
    if (!selectedText) return;

    const openaiToken = window.localStorage.getItem('generate-code-token');
    if (!openaiToken) {
      window.alert('Token is empty!');
      return;
    };

    const userProm = await this.userPrompt('Generate New Code', 'Enter a command to generate a new code...');
    const message = `${userProm}

${selectedText}`;
    const openai = new OpenAIApi(new Configuration({ apiKey: openaiToken}))
    const res = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are ChatGPT, a large language model trained by OpenAI.'},
        { role: 'user', content: message}
      ],
      temperature: 0
    });
    
    const result = res.data.choices[0].message.content;
    this.mdIt.render(result);
  }

  get mdIt() {
    return window.markdownit({
      html: false,
      xhtmlOut: false,
      breaks: false,
      linkify: false,
      typographer: false,
      quotes: '“”‘’',
      highlight: function (str) {editorManager.editor.insert(str)}
    });
  }

  /**
   * 
   * @param {String} title 
   * @param {String} placeholder 
   * @returns 
   */
  userPrompt(title, placeholder) {
    const options = {placeholder: placeholder}
    return prompt(title, '', 'text', options);
  }

  /**
   * 
   * @param {string} token 
   * @param {string} message 
   * @returns 
   */
  _openai(token, message) {
    const openai = new OpenAIApi(new Configuration({ apiKey: token}))

    const programmingLanguae = this.getCurrentModeName;

    return openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are ChatGPT, a large language model trained by OpenAI.'},
        { role: 'user', content: `Language: ${programmingLanguae}`},
        { role: 'user', content: message}
      ],
      temperature: 0
    });
  }

  async run() {
    try {
      let token;
      const openaiToken = window.localStorage.getItem('generate-code-token');
      if (openaiToken) {
        token = openaiToken;
      } else {
        let tokenPrompt = await multiPrompt(
          'Enter your openai api key',
          [{
            type: 'text',
            id: 'aicode-token',
            required: true,
            placeholder: 'Enter your openai api key'
          }],
          'https://platform.openai.com/api-keys'
        )
        token = tokenPrompt['aicode-token'];
        window.localStorage.setItem('generate-code-token', token);
      }
      
      const message = await this.userPrompt('Generate Code', 'Enter a command to generate a code...');
      const result = (await this._openai(token, message)).data.choices[0].message.content;
      this.mdIt.render(result);

    } catch (e) {}
  }

  async updateToken() {
    let newToken = await multiPrompt(
      'Enter your openai api key',
      [{
        type: 'text',
        id: 'aicode-token',
        required: true,
        placeholder: 'Enter your openai api key'
      }],
      'https://platform.openai.com/api-keys'
      )

    window.localStorage.removeItem('generate-code-token');
    window.localStorage.setItem('generate-code-token', newToken['aicode-token']);
    window.toast('Api Key Update!', 3000);
  }

  get getCurrentModeName() {
    const { editor } = editorManager;
    const session = editor.getSession();
    const currentMode = session.getMode();
    const currentModeName = currentMode.$id.split('/'); // [ace, mode, javascript]
    return currentModeName[currentModeName.length - 1];
  }

  async destroy() {
    editorManager.editor.commands.removeCommand('generate_code');
    editorManager.editor.commands.removeCommand('generate_code_update_token');
    editorManager.editor.commands.removeCommand('hide_generate_code_btn');
    editorManager.editor.commands.removeCommand('show_generate_code_btn');
    window.localStorage.removeItem('generate-code-token');
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
    }
  );
  acode.setPluginUnmount(plugin.id, () => {
    acodePlugin.destroy();
  });
}